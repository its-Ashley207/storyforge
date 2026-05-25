"""
app.py — The Story Forge Flask application.

Serves the React frontend from backend/static/ and exposes a REST + SSE API
that proxies AI generation calls to the DeepSeek V3 API.

Architecture notes:
- All AI calls use the user's own DeepSeek API key, sent via X-API-Key header.
- Server stores no API keys; they are never logged or persisted.
- SSE streams are produced by consuming DeepSeek's own streaming response and
  re-emitting each token chunk to the client in real time.
- SQLite is used for persistence; the DB file lives next to this module.
"""

import json
import os
import io
import time
import logging
from threading import Thread

import requests
from dotenv import load_dotenv
from flask import (
    Flask, Response, jsonify, request, send_from_directory,
    stream_with_context, abort,
)
from flask_cors import CORS

import db
import story_engine as engine
import export_engine as exporter

# ---------------------------------------------------------------------------
# Initialisation
# ---------------------------------------------------------------------------

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

PORT = int(os.environ.get("PORT", 8765))

# Server-side Gemini API key — hardcoded from the user for simplicity
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "AIzaSyC9BNWqKWuVU-nlVS4eQy0Cl2dv242cWI4")

# Resolve the static folder relative to this file so it works regardless of
# the working directory (important on Render.com).
_HERE = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(_HERE, "static")

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="")
CORS(app, origins="*")

# Initialise the database on startup.
db.init_db()

# ---------------------------------------------------------------------------
# Gemini API constants (using OpenAI compatibility layer)
# ---------------------------------------------------------------------------

GEMINI_CHAT_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
GEMINI_MODEL = "gemini-1.5-flash"
GEMINI_TIMEOUT = 90  # seconds for non-streaming calls


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def _get_api_key() -> str:
    """Return the server-side Gemini API key."""
    return GEMINI_API_KEY


def _require_api_key():
    """
    Return (key, None) if server key configured, else (None, error_response).
    """
    key = GEMINI_API_KEY
    if not key:
        return None, (
            jsonify({"error": "Server AI key not configured. Contact the app owner."}),
            503,
        )
    return key, None


def _gemini_headers(api_key: str) -> dict:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def _sse_event(data: dict) -> str:
    """Encode a dict as an SSE data line."""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _error_response(message: str, status: int = 400) -> tuple:
    return jsonify({"error": message}), status


def _call_gemini(api_key: str, messages: list[dict],
                   max_tokens: int = 300, temperature: float = 0.7) -> str:
    """
    Make a synchronous (non-streaming) call to Gemini.
    Returns the assistant reply text, or raises on error.
    """
    payload = {
        "model": GEMINI_MODEL,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
    }
    resp = requests.post(
        GEMINI_CHAT_URL,
        headers=_gemini_headers(api_key),
        json=payload,
        timeout=GEMINI_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"].strip()


def _stream_gemini(api_key: str, messages: list[dict],
                     max_tokens: int = 4096,
                     temperature: float = 0.85):
    """
    Generator that yields raw text chunks from Gemini's streaming API.

    Gemini's OpenAI endpoint uses the same SSE format as OpenAI: each line is either
    "data: {json}" or "data: [DONE]".
    """
    payload = {
        "model": GEMINI_MODEL,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": True,
    }
    with requests.post(
        GEMINI_CHAT_URL,
        headers=_gemini_headers(api_key),
        json=payload,
        stream=True,
        timeout=GEMINI_TIMEOUT,
    ) as resp:
        if resp.status_code != 200:
            # Attempt to read the error body
            try:
                err_body = resp.json()
                msg = err_body.get("error", {}).get("message", resp.text)
            except Exception:
                msg = resp.text or f"HTTP {resp.status_code}"
            raise RuntimeError(f"Gemini API error {resp.status_code}: {msg}")

        for raw_line in resp.iter_lines():
            if not raw_line:
                continue
            if isinstance(raw_line, bytes):
                raw_line = raw_line.decode("utf-8")

            if not raw_line.startswith("data:"):
                continue

            payload_str = raw_line[len("data:"):].strip()
            if payload_str == "[DONE]":
                return

            try:
                chunk = json.loads(payload_str)
            except json.JSONDecodeError:
                continue

            delta = chunk.get("choices", [{}])[0].get("delta", {})
            content = delta.get("content")
            if content:
                yield content


# ---------------------------------------------------------------------------
# Background summary helper (runs in a daemon thread after chapter save)
# ---------------------------------------------------------------------------

def _background_summarise(api_key: str, story_id: str,
                           chapter_num: int, content: str) -> None:
    """Call Gemini to generate a chapter summary and update the DB row."""
    try:
        messages = engine.build_summary_prompt(content)
        summary = _call_gemini(api_key, messages, max_tokens=150,
                                 temperature=0.3)
        db.save_chapter(
            story_id=story_id,
            chapter_num=chapter_num,
            title="",      # already saved; ON CONFLICT will overwrite
            content=content,
            summary=summary,
            word_count=engine.count_words(content),
        )
        logger.info("Background summary saved for ch.%d story %s",
                    chapter_num, story_id)
    except Exception as exc:
        logger.warning("Background summary failed: %s", exc)


# ---------------------------------------------------------------------------
# Static / health routes
# ---------------------------------------------------------------------------

@app.route("/.well-known/assetlinks.json")
def asset_links():
    """
    Digital Asset Links — required for TWA verification on Android / Play Store.
    The SHA256 fingerprint must match the release keystore used to sign the APK.
    """
    return jsonify([
        {
            "relation": ["delegate_permission/common.handle_all_urls"],
            "target": {
                "namespace": "android_app",
                "package_name": "com.storyforge.app",
                "sha256_cert_fingerprints": [
                    "A6:9D:05:3E:84:B6:C0:6D:CF:CF:61:F2:D5:79:39:55:7F:A0:0D:D0:45:72:D6:AA:07:00:3E:74:C0:95:39:43"
                ]
            }
        }
    ])


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_react(path: str):
    """
    Serve the React build from backend/static/.
    Falls back to index.html for client-side routing.
    """
    if path and os.path.exists(os.path.join(STATIC_DIR, path)):
        return send_from_directory(STATIC_DIR, path)
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return send_from_directory(STATIC_DIR, "index.html")
    # Dev fallback: no React build present yet
    return jsonify({
        "service": "The Story Forge API",
        "status": "running",
        "note": "React frontend not built yet — place build in backend/static/",
    }), 200


@app.route("/health")
def health():
    """Kubernetes / Render health check endpoint."""
    return jsonify({"status": "ok", "model": DEEPSEEK_MODEL})


@app.route("/api/models")
def get_models():
    """Return the list of available AI models."""
    return jsonify([
        {
            "id": "deepseek-chat",
            "name": "DeepSeek V3",
            "description": "Best quality — fast, creative, long-context",
        }
    ])


# ---------------------------------------------------------------------------
# API key validation
# ---------------------------------------------------------------------------

@app.route("/api/validate-key", methods=["POST"])
def validate_key():
    """
    Returns whether the server has a Gemini API key configured.
    """
    if GEMINI_API_KEY:
        return jsonify({"valid": True})
    return jsonify({"valid": False, "error": "No API key configured on server"}), 503


# ---------------------------------------------------------------------------
# Stories CRUD
# ---------------------------------------------------------------------------

@app.route("/api/stories", methods=["GET"])
def list_stories():
    return jsonify(db.list_stories())


@app.route("/api/stories", methods=["POST"])
def create_story():
    data = request.get_json(silent=True) or {}
    if not data.get("title"):
        return _error_response("'title' is required")
    story = db.create_story(data)
    return jsonify(story), 201


@app.route("/api/stories/<story_id>", methods=["GET"])
def get_story(story_id: str):
    story = db.get_story(story_id)
    if not story:
        return _error_response("Story not found", 404)
    story["chapters"] = db.get_chapters(story_id)
    story["characters"] = db.get_characters(story_id)
    return jsonify(story)


@app.route("/api/stories/<story_id>", methods=["PUT"])
def update_story(story_id: str):
    if not db.get_story(story_id):
        return _error_response("Story not found", 404)
    data = request.get_json(silent=True) or {}
    story = db.update_story(story_id, data)
    return jsonify(story)


@app.route("/api/stories/<story_id>", methods=["DELETE"])
def delete_story(story_id: str):
    deleted = db.delete_story(story_id)
    if not deleted:
        return _error_response("Story not found", 404)
    return jsonify({"deleted": True, "id": story_id})


# ---------------------------------------------------------------------------
# Characters CRUD
# ---------------------------------------------------------------------------

@app.route("/api/stories/<story_id>/characters", methods=["GET"])
def list_characters(story_id: str):
    if not db.get_story(story_id):
        return _error_response("Story not found", 404)
    return jsonify(db.get_characters(story_id))


@app.route("/api/stories/<story_id>/characters", methods=["POST"])
def create_character(story_id: str):
    if not db.get_story(story_id):
        return _error_response("Story not found", 404)
    data = request.get_json(silent=True) or {}
    if not data.get("name"):
        return _error_response("'name' is required")
    char = db.create_character(story_id, data)
    return jsonify(char), 201


@app.route("/api/characters/<char_id>", methods=["PUT"])
def update_character(char_id: str):
    if not db.get_character(char_id):
        return _error_response("Character not found", 404)
    data = request.get_json(silent=True) or {}
    char = db.update_character(char_id, data)
    return jsonify(char)


@app.route("/api/characters/<char_id>", methods=["DELETE"])
def delete_character(char_id: str):
    deleted = db.delete_character(char_id)
    if not deleted:
        return _error_response("Character not found", 404)
    return jsonify({"deleted": True, "id": char_id})


# ---------------------------------------------------------------------------
# Chapter generation — SSE streaming
# ---------------------------------------------------------------------------

@app.route("/api/generate/chapter", methods=["POST"])
def generate_chapter():
    """
    SSE endpoint: streams a chapter token-by-token from DeepSeek,
    then saves it to the DB and emits a "done" event.

    Expected body:
      { story_id, chapter_num, hint?, word_count? }
    """
    key, err = _require_api_key()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    story_id = data.get("story_id", "")
    chapter_num = int(data.get("chapter_num", 1))
    hint = data.get("hint", "")
    word_count = int(data.get("word_count", 1500))

    story_ctx = db.get_story_context(story_id)
    if not story_ctx:
        return _error_response("Story not found", 404)

    chapters_so_far = story_ctx.get("chapter_summaries", [])
    messages = engine.build_chapter_prompt(
        story=story_ctx,
        chapters_so_far=chapters_so_far,
        chapter_num=chapter_num,
        hint=hint,
        word_count=word_count,
    )

    # Estimate max tokens: ~1.3 tokens per word + prompt overhead
    max_tokens = min(8000, max(1500, int(word_count * 1.4) + 400))

    def generate():
        full_text = []
        try:
            for chunk in _stream_gemini(key, messages,
                                          max_tokens=max_tokens,
                                          temperature=0.85):
                full_text.append(chunk)
                yield _sse_event({"type": "chunk", "text": chunk})

            # ---- Post-stream: save to DB ----
            complete_text = "".join(full_text)
            title = engine.extract_title(complete_text)
            wc = engine.count_words(complete_text)

            saved = db.save_chapter(
                story_id=story_id,
                chapter_num=chapter_num,
                title=title,
                content=complete_text,
                summary="",   # filled in by background thread
                word_count=wc,
            )

            chapter_id = saved["id"] if saved else None

            # Fire-and-forget summarisation in background
            t = Thread(
                target=_background_summarise,
                args=(key, story_id, chapter_num, complete_text),
                daemon=True,
            )
            t.start()

            yield _sse_event({
                "type": "done",
                "chapter_id": chapter_id,
                "chapter_num": chapter_num,
                "title": title,
                "word_count": wc,
            })

        except Exception as exc:
            logger.error("Chapter generation error: %s", exc, exc_info=True)
            yield _sse_event({"type": "error", "message": str(exc)})

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # Disable Nginx buffering on Render
        },
    )


# ---------------------------------------------------------------------------
# Adventure node generation — SSE streaming
# ---------------------------------------------------------------------------

@app.route("/api/generate/adventure", methods=["POST"])
def generate_adventure():
    """
    SSE endpoint: streams an adventure node then emits a final event with
    the parsed choices.

    Expected body:
      { story_id, parent_node_id?, num_choices? }
    """
    key, err = _require_api_key()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    story_id = data.get("story_id", "")
    parent_node_id = data.get("parent_node_id") or None
    num_choices = int(data.get("num_choices", 3))

    story_ctx = db.get_story_context(story_id)
    if not story_ctx:
        return _error_response("Story not found", 404)

    # Build ancestor chain for narrative continuity
    node_history = []
    if parent_node_id:
        node_history = db.get_node_ancestors(parent_node_id)

    depth = len(node_history)

    messages = engine.build_adventure_prompt(
        story=story_ctx,
        node_history=node_history,
        num_choices=num_choices,
    )

    def generate():
        full_text = []
        try:
            for chunk in _stream_gemini(key, messages,
                                          max_tokens=1200,
                                          temperature=0.9):
                full_text.append(chunk)
                yield _sse_event({"type": "chunk", "text": chunk})

            complete_text = "".join(full_text).strip()

            # Parse JSON from the model output
            choices = []
            content = complete_text
            try:
                # Strip any accidental markdown fences
                clean = complete_text
                if "```" in clean:
                    import re
                    clean = re.sub(r"```[a-z]*\n?", "", clean).strip()
                parsed = json.loads(clean)
                content = parsed.get("content", complete_text)
                raw_choices = parsed.get("choices", [])
                choices = [
                    {"text": c.get("text", str(c)), "node_id": None}
                    for c in raw_choices
                ]
            except (json.JSONDecodeError, AttributeError):
                logger.warning("Adventure: could not parse JSON from model output")
                # Provide generic choices as fallback
                choices = [
                    {"text": f"Choice {i + 1}", "node_id": None}
                    for i in range(num_choices)
                ]

            # Save the node, then patch in the real node_id for choices
            saved = db.save_adventure_node(
                story_id=story_id,
                parent_id=parent_node_id,
                content=content,
                choices=choices,
                depth=depth,
            )

            node_id = saved["id"] if saved else None

            yield _sse_event({
                "type": "done",
                "node_id": node_id,
                "content": content,
                "choices": choices,
                "depth": depth,
            })

        except Exception as exc:
            logger.error("Adventure generation error: %s", exc, exc_info=True)
            yield _sse_event({"type": "error", "message": str(exc)})

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Chat generation — SSE streaming
# ---------------------------------------------------------------------------

@app.route("/api/generate/chat", methods=["POST"])
def generate_chat():
    """
    SSE endpoint: streams a story-assistant chat reply.

    Expected body:
      { story_id, message }
    """
    key, err = _require_api_key()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    story_id = data.get("story_id", "")
    user_message = (data.get("message") or "").strip()

    if not user_message:
        return _error_response("'message' is required")

    story_ctx = db.get_story_context(story_id)
    if not story_ctx:
        return _error_response("Story not found", 404)

    # Persist user message
    db.save_chat_message(story_id, "user", user_message)

    # Build history (excluding the one we just inserted so we add it in prompt)
    prior_messages = db.get_chat_messages(story_id, limit=40)
    # Remove the last message (the one we just saved) since we pass it explicitly
    if prior_messages and prior_messages[-1]["role"] == "user":
        prior_messages = prior_messages[:-1]

    messages = engine.build_chat_prompt(
        story=story_ctx,
        messages=prior_messages,
        user_message=user_message,
    )

    def generate():
        full_reply = []
        try:
            for chunk in _stream_gemini(key, messages,
                                          max_tokens=1000,
                                          temperature=0.8):
                full_reply.append(chunk)
                yield _sse_event({"type": "chunk", "text": chunk})

            reply_text = "".join(full_reply).strip()

            # Persist assistant reply
            saved = db.save_chat_message(story_id, "assistant", reply_text)
            msg_id = saved["id"] if saved else None

            yield _sse_event({
                "type": "done",
                "message_id": msg_id,
            })

        except Exception as exc:
            logger.error("Chat generation error: %s", exc, exc_info=True)
            yield _sse_event({"type": "error", "message": str(exc)})

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Additional story-data endpoints
# ---------------------------------------------------------------------------

@app.route("/api/stories/<story_id>/chapters", methods=["GET"])
def list_chapters(story_id: str):
    """Return all chapters for a story."""
    if not db.get_story(story_id):
        return _error_response("Story not found", 404)
    return jsonify(db.get_chapters(story_id))


@app.route("/api/stories/<story_id>/chat", methods=["GET"])
def get_chat_history(story_id: str):
    """Return recent chat messages for a story."""
    if not db.get_story(story_id):
        return _error_response("Story not found", 404)
    limit = int(request.args.get("limit", 40))
    return jsonify(db.get_chat_messages(story_id, limit=limit))


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

@app.route("/api/stories/<story_id>/export/<fmt>", methods=["GET"])
def export_story(story_id: str, fmt: str):
    """
    Download the story as TXT, PDF, or EPUB.

    GET /api/stories/<id>/export/txt
    GET /api/stories/<id>/export/pdf
    GET /api/stories/<id>/export/epub
    """
    story = db.get_story(story_id)
    if not story:
        return _error_response("Story not found", 404)

    chapters = db.get_chapters(story_id)
    if not chapters:
        return _error_response("No chapters to export yet", 400)

    safe_title = "".join(
        c if c.isalnum() or c in " _-" else "_"
        for c in story.get("title", "story")
    ).strip()[:50] or "story"

    fmt = fmt.lower()

    if fmt == "txt":
        content = exporter.export_txt(story, chapters)
        return Response(
            content,
            mimetype="text/plain; charset=utf-8",
            headers={
                "Content-Disposition":
                    f'attachment; filename="{safe_title}.txt"',
            },
        )

    elif fmt == "pdf":
        try:
            content = exporter.export_pdf(story, chapters)
        except ImportError as exc:
            return _error_response(
                f"PDF export requires reportlab: {exc}", 500
            )
        return Response(
            content,
            mimetype="application/pdf",
            headers={
                "Content-Disposition":
                    f'attachment; filename="{safe_title}.pdf"',
            },
        )

    elif fmt == "epub":
        try:
            content = exporter.export_epub(story, chapters)
        except ImportError as exc:
            return _error_response(
                f"EPUB export requires ebooklib: {exc}", 500
            )
        return Response(
            content,
            mimetype="application/epub+zip",
            headers={
                "Content-Disposition":
                    f'attachment; filename="{safe_title}.epub"',
            },
        )

    else:
        return _error_response(
            f"Unknown format '{fmt}'. Use: txt, pdf, epub", 400
        )


# ---------------------------------------------------------------------------
# Global error handlers
# ---------------------------------------------------------------------------

@app.errorhandler(404)
def not_found(e):
    # Only return JSON for API routes; let React handle all other 404s
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found"}), 404
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return send_from_directory(STATIC_DIR, "index.html")
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"error": "Method not allowed"}), 405


@app.errorhandler(500)
def internal_error(e):
    logger.exception("Internal server error")
    return jsonify({"error": "Internal server error"}), 500


# ---------------------------------------------------------------------------
# Entry point (development only — production uses gunicorn)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logger.info("Starting The Story Forge on port %d", PORT)
    app.run(host="0.0.0.0", port=PORT, debug=True, threaded=True)
