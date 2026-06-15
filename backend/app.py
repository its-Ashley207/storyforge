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

# import g4f Client — auto-select mode (no specific provider pinned)
from g4f.client import Client

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

# Resolve the static folder relative to this file so it works regardless of
# the working directory (important on Render.com).
_HERE = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(_HERE, "static")

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="")
CORS(app, origins="*")

# Initialise the database on startup.
db.init_db()

# Initialize g4f client — no provider pinned, so g4f auto-selects a working one.
g4f_client = Client()

# Retry settings for rate-limit resilience
_MAX_RETRIES = 3
_RETRY_DELAY_SECS = 3  # seconds between retries

# ---------------------------------------------------------------------------
# g4f Wrapper
# ---------------------------------------------------------------------------

def _sse_event(data: dict) -> str:
    """Encode a dict as an SSE data line."""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _error_response(message: str, status: int = 400) -> tuple:
    return jsonify({"error": message}), status


def _call_g4f(messages: list[dict], max_tokens: int = 300, temperature: float = 0.7) -> str:
    """
    Make a synchronous (non-streaming) call to g4f with retry logic.
    Returns the assistant reply text, or raises on error.
    """
    last_error = None
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            logger.info("g4f sync call, attempt %d/%d...", attempt, _MAX_RETRIES)
            response = g4f_client.chat.completions.create(
                model="",
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                stream=False
            )
            text = response.choices[0].message.content.strip()
            if text:
                logger.info("g4f sync call succeeded on attempt %d.", attempt)
                return text
        except Exception as e:
            logger.warning("g4f sync attempt %d failed: %s", attempt, e)
            last_error = e
            if attempt < _MAX_RETRIES:
                time.sleep(_RETRY_DELAY_SECS * attempt)  # exponential backoff
    raise RuntimeError(f"AI generation failed after {_MAX_RETRIES} attempts. Last error: {last_error}")


def _stream_g4f(messages: list[dict], max_tokens: int = 4096, temperature: float = 0.85):
    """
    Generator that yields raw text chunks from g4f streaming API.
    Retries up to _MAX_RETRIES times if a provider error occurs.
    """
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            logger.info("g4f stream call, attempt %d/%d...", attempt, _MAX_RETRIES)
            response = g4f_client.chat.completions.create(
                model="",
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                stream=True
            )
            chunks_yielded = 0
            for chunk in response:
                if chunk.choices and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta
                    content = getattr(delta, 'content', None)
                    if content:
                        yield content
                        chunks_yielded += 1
            if chunks_yielded > 0:
                logger.info("g4f stream succeeded on attempt %d (%d chunks).", attempt, chunks_yielded)
                return  # success
            else:
                logger.warning("g4f stream attempt %d returned 0 chunks.", attempt)
        except Exception as e:
            logger.warning("g4f stream attempt %d failed: %s", attempt, e)
            if attempt < _MAX_RETRIES:
                time.sleep(_RETRY_DELAY_SECS * attempt)
    yield "ERROR: AI generation is temporarily unavailable. Please try again in a moment."


# ---------------------------------------------------------------------------
# Background summary helper (runs in a daemon thread after chapter save)
# ---------------------------------------------------------------------------

def _background_summarise(story_id: str, chapter_num: int, content: str) -> None:
    """Call g4f to generate a chapter summary and update the DB row."""
    try:
        messages = engine.build_summary_prompt(content)
        summary = _call_g4f(messages, max_tokens=150, temperature=0.3)
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
    return jsonify({"status": "ok", "engine": "g4f-auto"})


@app.route("/api/models")
def get_models():
    """Return the list of available AI models."""
    return jsonify([
        {
            "id": "g4f-multi",
            "name": "Free AI (Auto-Select)",
            "description": "Automatically selects the best available free AI provider",
        }
    ])


# ---------------------------------------------------------------------------
# API key validation
# ---------------------------------------------------------------------------

@app.route("/api/validate-key", methods=["POST"])
def validate_key():
    """
    Returns whether the server is configured (always true for g4f).
    """
    return jsonify({"valid": True})


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
            for event in _stream_g4f(messages, max_tokens=max_tokens, temperature=0.85):
                full_text.append(event)
                yield _sse_event({"type": "chunk", "text": event})

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
                args=(story_id, chapter_num, complete_text),
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
            for event in _stream_g4f(messages, max_tokens=1200, temperature=0.9):
                full_text.append(event)
                yield _sse_event({"type": "chunk", "text": event})

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
            for event in _stream_g4f(messages, max_tokens=1000, temperature=0.8):
                full_reply.append(event)
                yield _sse_event({"type": "chunk", "text": event})

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
