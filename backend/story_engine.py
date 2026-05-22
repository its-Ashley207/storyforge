"""
story_engine.py — Prompt-building logic for The Story Forge.

All functions return plain strings (or dicts of strings) ready to be sent
to the DeepSeek API.  No network calls are made here.
"""

import json
import re


# ---------------------------------------------------------------------------
# Shared style directives injected into every fiction prompt
# ---------------------------------------------------------------------------

_STYLE_RULES = """
Writing guidelines (follow strictly):
- Write vivid, immersive, literary fiction — show don't tell.
- Use rich sensory detail: sight, sound, smell, touch, taste.
- Develop authentic character voice and natural dialogue.
- Vary sentence length for rhythm; avoid monotonous structure.
- Avoid AI writing clichés: no "tapestry", "testament", "delve", "whispering",
  "weaving", "myriad", "beacon", "intricacies", "embark", "unleash", "realm",
  "unravel", "captivating", "pivotal", "labyrinth", "mosaic", "palpable",
  "multifaceted", "groundbreaking", "ethereal", "testament to", "stands as".
- Write like a skilled human novelist — surprising, specific, human.
- Do NOT summarise or meta-comment. Write the story itself.
"""


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def count_words(text: str) -> int:
    """Count whitespace-delimited words in *text*."""
    return len(text.split()) if text else 0


def extract_title(content: str) -> str:
    """
    Try to pull a chapter title from the generated content.

    Looks for common patterns:
      - A line starting with "Chapter N:" or "Title:"
      - A markdown heading (# …)
      - Falls back to the first non-empty line (truncated to 80 chars).
    """
    lines = [l.strip() for l in content.splitlines() if l.strip()]
    if not lines:
        return "Untitled Chapter"

    patterns = [
        # "Chapter 3: The Dark Forest" or "Chapter Three — ..."
        r"^chapter\s+[\w]+[:\s\-–—]+(.+)$",
        # "Title: The Storm Breaks"
        r"^title[:\s]+(.+)$",
        # Markdown heading "# The Storm Breaks"
        r"^#{1,3}\s+(.+)$",
    ]
    for line in lines[:5]:
        for pat in patterns:
            m = re.match(pat, line, re.IGNORECASE)
            if m:
                return m.group(1).strip()[:120]

    # Fall back: first line, trimmed
    first = lines[0]
    # Strip leading markdown hash symbols
    first = re.sub(r"^#+\s*", "", first)
    return first[:120] if first else "Untitled Chapter"


def _character_block(ctx: dict) -> str:
    """Build a compact character reference string from story context."""
    # Merge characters from both sources (db rows + inline JSON)
    chars = []
    for c in ctx.get("db_characters", []):
        parts = [c["name"]]
        if c.get("role"):
            parts.append(f"({c['role']})")
        if c.get("description"):
            parts.append(f"— {c['description']}")
        if c.get("traits"):
            parts.append(f"[Traits: {c['traits']}]")
        chars.append(" ".join(parts))

    inline = ctx.get("characters_parsed", [])
    if isinstance(inline, list):
        for item in inline:
            if isinstance(item, dict):
                name = item.get("name", "")
                if name and not any(name in c for c in chars):
                    chars.append(name)
            elif isinstance(item, str) and item:
                if item not in chars:
                    chars.append(item)

    if not chars:
        return ""
    return "Characters:\n" + "\n".join(f"  • {c}" for c in chars)


def _chapter_history_block(ctx: dict) -> str:
    """Summarise completed chapters into a compact recap."""
    summaries = ctx.get("chapter_summaries", [])
    if not summaries:
        return ""
    lines = ["Story so far (chapter summaries):"]
    for s in summaries:
        num = s.get("chapter_num", "?")
        title = s.get("title", "")
        summary = s.get("summary", "").strip()
        head = f"  Ch.{num}" + (f" — {title}" if title else "")
        if summary:
            lines.append(f"{head}: {summary}")
        else:
            lines.append(head)
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Chapter generation prompt
# ---------------------------------------------------------------------------

def build_chapter_prompt(
    story: dict,
    chapters_so_far: list[dict],
    chapter_num: int,
    hint: str = "",
    word_count: int = 1500,
) -> list[dict]:
    """
    Build the messages list for a chapter generation request.

    Returns a list of OpenAI-compatible message dicts:
      [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}]
    """
    genre = story.get("genre", "fiction")
    tone = story.get("tone", "engaging")
    total = story.get("total_chapters", 10)
    title = story.get("title", "Untitled")
    summary = story.get("summary", "")
    world_notes = story.get("world_notes", "")

    # ---- System prompt ----
    system = (
        f"You are a masterful fiction writer crafting a {genre} novel "
        f"with a {tone} tone called \"{title}\".\n\n"
        f"{_STYLE_RULES}"
    )

    # ---- User prompt ----
    user_parts = []

    if summary:
        user_parts.append(f"Story premise:\n{summary}")

    if world_notes:
        user_parts.append(f"World / setting notes:\n{world_notes}")

    char_block = _character_block(story)
    if char_block:
        user_parts.append(char_block)

    # Use chapter summaries passed directly (already from context)
    if chapters_so_far:
        lines = ["Story so far (chapter summaries):"]
        for ch in chapters_so_far:
            num = ch.get("chapter_num", "?")
            ch_title = ch.get("title", "")
            ch_sum = (ch.get("summary") or "").strip()
            head = f"  Ch.{num}" + (f" — {ch_title}" if ch_title else "")
            lines.append(f"{head}: {ch_sum}" if ch_sum else head)
        user_parts.append("\n".join(lines))

    # Narrative position hint
    if chapter_num == 1:
        position = "This is the OPENING chapter — establish the world, the protagonist, and a compelling hook."
    elif chapter_num == total:
        position = "This is the FINAL chapter — bring all threads to a satisfying, resonant conclusion."
    elif chapter_num > total * 0.7:
        position = "This is a LATE chapter — escalate tension, reveal consequences, and move toward resolution."
    elif chapter_num > total * 0.4:
        position = "This is a MID-STORY chapter — deepen character, complicate the plot, raise the stakes."
    else:
        position = "This is an EARLY chapter — build momentum and deepen the reader's investment."

    instruction = (
        f"Write Chapter {chapter_num} of {total}. {position}\n"
        f"Target length: approximately {word_count} words.\n"
        "Begin with a chapter title on the first line (e.g. 'Chapter {n}: Title Here'), "
        "then write the full chapter text.\n"
    )
    if hint:
        instruction += f"\nAuthor's direction for this chapter: {hint}\n"

    user_parts.append(instruction)

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": "\n\n".join(user_parts)},
    ]


# ---------------------------------------------------------------------------
# Adventure / choose-your-own prompt
# ---------------------------------------------------------------------------

def build_adventure_prompt(
    story: dict,
    node_history: list[dict],
    num_choices: int = 3,
) -> list[dict]:
    """
    Build messages for a choose-your-own-adventure node.

    The model must return a JSON object with:
      {
        "content": "<narrative passage>",
        "choices": [{"text": "<short choice label>"}, ...]
      }
    """
    genre = story.get("genre", "fiction")
    tone = story.get("tone", "engaging")
    title = story.get("title", "Untitled")

    system = (
        f"You are an interactive fiction author writing a {genre} story "
        f"titled \"{title}\" with a {tone} tone.\n\n"
        f"{_STYLE_RULES}\n"
        "IMPORTANT: You MUST respond with valid JSON only — no markdown fences, "
        "no prose outside the JSON object. Schema:\n"
        '{"content": "<2-4 paragraph narrative passage>", '
        f'"choices": [' + ', '.join(['{"text": "<choice label>"}'] * num_choices) + ']}'
    )

    user_parts = []

    summary = story.get("summary", "")
    if summary:
        user_parts.append(f"Story premise:\n{summary}")

    char_block = _character_block(story)
    if char_block:
        user_parts.append(char_block)

    if node_history:
        lines = ["Story path so far:"]
        for i, node in enumerate(node_history):
            content_snippet = (node.get("content") or "")[:300].replace("\n", " ")
            lines.append(f"  Passage {i + 1}: {content_snippet}…")
        user_parts.append("\n".join(lines))

    if node_history:
        user_parts.append(
            f"Continue the story from where it left off. "
            f"Write a vivid passage (2–4 paragraphs) and provide exactly "
            f"{num_choices} meaningful choices that branch the story in "
            "genuinely different directions. "
            "Return ONLY the JSON object described above."
        )
    else:
        user_parts.append(
            f"Begin the story. Write an opening passage (2–4 paragraphs) "
            f"and provide exactly {num_choices} compelling starting choices. "
            "Return ONLY the JSON object described above."
        )

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": "\n\n".join(user_parts)},
    ]


# ---------------------------------------------------------------------------
# Chat / story-assistant prompt
# ---------------------------------------------------------------------------

def build_chat_prompt(
    story: dict,
    messages: list[dict],
    user_message: str,
) -> list[dict]:
    """
    Build messages for the story-assistant chat mode.

    *messages* is a list of previous {"role": ..., "content": ...} dicts.
    """
    title = story.get("title", "Untitled")
    genre = story.get("genre", "fiction")
    tone = story.get("tone", "engaging")
    summary = story.get("summary", "")
    world_notes = story.get("world_notes", "")

    system_parts = [
        f"You are a creative writing assistant helping the author of a {genre} "
        f"story called \"{title}\" (tone: {tone}).",
        "You can: brainstorm plot ideas, suggest character development, write "
        "scene drafts, answer lore questions, or help fix pacing issues.",
        "Be concise, creative, and direct. Do NOT add unnecessary disclaimers.",
    ]
    if summary:
        system_parts.append(f"Story premise:\n{summary}")
    if world_notes:
        system_parts.append(f"World notes:\n{world_notes}")

    char_block = _character_block(story)
    if char_block:
        system_parts.append(char_block)

    chapter_block = _chapter_history_block(story)
    if chapter_block:
        system_parts.append(chapter_block)

    result = [{"role": "system", "content": "\n\n".join(system_parts)}]

    # Inject previous chat history (cap at last 20 exchanges to stay within context)
    for msg in messages[-40:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role in ("user", "assistant") and content:
            result.append({"role": role, "content": content})

    result.append({"role": "user", "content": user_message})
    return result


# ---------------------------------------------------------------------------
# Summary prompt (used after chapter is saved)
# ---------------------------------------------------------------------------

def build_summary_prompt(content: str) -> list[dict]:
    """
    Return messages asking DeepSeek to summarise a chapter in 1–2 sentences.
    Used internally after chapter generation to populate the `summary` field.
    """
    system = (
        "You are a meticulous story editor. Summarise the provided chapter "
        "in exactly 1–2 sentences, focusing on key plot events and character "
        "developments. Be specific, not generic. Do NOT start with 'In this chapter'."
    )
    user = f"Summarise the following chapter:\n\n{content[:6000]}"
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
