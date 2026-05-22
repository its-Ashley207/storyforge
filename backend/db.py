"""
db.py — SQLite database layer for The Story Forge.

Manages stories, chapters, characters, adventure nodes, and chat messages.
All IDs are UUIDs generated server-side at insert time.
"""

import sqlite3
import json
import uuid
import os
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Database path — stored next to this file so it persists across restarts.
# On Render.com the filesystem is ephemeral; mount a persistent disk or swap
# to a hosted SQLite-compatible service (e.g. Turso) for production durability.
# ---------------------------------------------------------------------------
DB_PATH = os.path.join(os.path.dirname(__file__), "storyforge.db")


# ---------------------------------------------------------------------------
# Connection helper
# ---------------------------------------------------------------------------

def get_conn() -> sqlite3.Connection:
    """Return a SQLite connection with row_factory set to Row."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # Enable WAL mode for better concurrent read performance.
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def _now() -> str:
    """ISO-8601 UTC timestamp string."""
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    """Generate a new UUID4 string."""
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Schema initialisation
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE IF NOT EXISTS stories (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    summary         TEXT DEFAULT '',
    genre           TEXT DEFAULT '',
    tone            TEXT DEFAULT '',
    characters_json TEXT DEFAULT '[]',
    world_notes     TEXT DEFAULT '',
    total_chapters  INTEGER DEFAULT 10,
    status          TEXT DEFAULT 'in_progress',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chapters (
    id          TEXT PRIMARY KEY,
    story_id    TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    chapter_num INTEGER NOT NULL,
    title       TEXT DEFAULT '',
    content     TEXT DEFAULT '',
    summary     TEXT DEFAULT '',
    word_count  INTEGER DEFAULT 0,
    created_at  TEXT NOT NULL,
    UNIQUE(story_id, chapter_num)
);

CREATE TABLE IF NOT EXISTS characters (
    id          TEXT PRIMARY KEY,
    story_id    TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    role        TEXT DEFAULT '',
    description TEXT DEFAULT '',
    traits      TEXT DEFAULT '',
    notes       TEXT DEFAULT '',
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS adventure_nodes (
    id          TEXT PRIMARY KEY,
    story_id    TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    parent_id   TEXT REFERENCES adventure_nodes(id) ON DELETE SET NULL,
    content     TEXT DEFAULT '',
    choices_json TEXT DEFAULT '[]',
    depth       INTEGER DEFAULT 0,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id          TEXT PRIMARY KEY,
    story_id    TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content     TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chapters_story   ON chapters(story_id, chapter_num);
CREATE INDEX IF NOT EXISTS idx_characters_story ON characters(story_id);
CREATE INDEX IF NOT EXISTS idx_nodes_story      ON adventure_nodes(story_id);
CREATE INDEX IF NOT EXISTS idx_chat_story       ON chat_messages(story_id, created_at);
"""


def init_db() -> None:
    """Create all tables and indexes if they do not already exist."""
    with get_conn() as conn:
        conn.executescript(_SCHEMA)
    print(f"[db] Initialised database at {DB_PATH}")


# ---------------------------------------------------------------------------
# Story helpers
# ---------------------------------------------------------------------------

def get_story(story_id: str) -> dict | None:
    """Return a story row as a dict, or None if not found."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM stories WHERE id = ?", (story_id,)
        ).fetchone()
    if row is None:
        return None
    return dict(row)


def list_stories() -> list[dict]:
    """Return all stories with a computed chapter_count field."""
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT s.id, s.title, s.genre, s.tone, s.status,
                   s.total_chapters, s.created_at, s.updated_at,
                   COUNT(c.id) AS chapter_count
            FROM stories s
            LEFT JOIN chapters c ON c.story_id = s.id
            GROUP BY s.id
            ORDER BY s.updated_at DESC
        """).fetchall()
    return [dict(r) for r in rows]


def create_story(data: dict) -> dict:
    """Insert a new story and return the created row."""
    now = _now()
    story_id = _new_id()
    # Serialise characters list if passed as Python list
    characters_json = data.get("characters_json", data.get("characters", []))
    if not isinstance(characters_json, str):
        characters_json = json.dumps(characters_json)

    with get_conn() as conn:
        conn.execute("""
            INSERT INTO stories
                (id, title, summary, genre, tone, characters_json,
                 world_notes, total_chapters, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?)
        """, (
            story_id,
            data.get("title", "Untitled Story"),
            data.get("summary", ""),
            data.get("genre", ""),
            data.get("tone", ""),
            characters_json,
            data.get("world_notes", ""),
            int(data.get("total_chapters", 10)),
            now,
            now,
        ))
    return get_story(story_id)


def update_story(story_id: str, data: dict) -> dict | None:
    """Update mutable story fields and return the updated row."""
    now = _now()
    allowed = {
        "title", "summary", "genre", "tone",
        "world_notes", "total_chapters", "status",
    }
    # Handle characters as JSON if provided
    updates = {k: v for k, v in data.items() if k in allowed}

    if "characters" in data:
        chars = data["characters"]
        updates["characters_json"] = (
            chars if isinstance(chars, str) else json.dumps(chars)
        )

    if not updates:
        return get_story(story_id)

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [now, story_id]

    with get_conn() as conn:
        conn.execute(
            f"UPDATE stories SET {set_clause}, updated_at = ? WHERE id = ?",
            values,
        )
    return get_story(story_id)


def delete_story(story_id: str) -> bool:
    """Delete a story and all cascaded child records."""
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM stories WHERE id = ?", (story_id,))
    return cur.rowcount > 0


# ---------------------------------------------------------------------------
# Chapter helpers
# ---------------------------------------------------------------------------

def get_chapters(story_id: str) -> list[dict]:
    """Return all chapters for a story ordered by chapter number."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM chapters WHERE story_id = ? ORDER BY chapter_num",
            (story_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_chapter_by_num(story_id: str, chapter_num: int) -> dict | None:
    """Return a single chapter by story + number."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM chapters WHERE story_id = ? AND chapter_num = ?",
            (story_id, chapter_num),
        ).fetchone()
    return dict(row) if row else None


def save_chapter(story_id: str, chapter_num: int, title: str,
                 content: str, summary: str, word_count: int) -> dict:
    """Upsert a chapter (insert or replace on conflict)."""
    now = _now()
    chapter_id = _new_id()
    with get_conn() as conn:
        # Use INSERT OR REPLACE so re-generation updates the row cleanly.
        conn.execute("""
            INSERT INTO chapters
                (id, story_id, chapter_num, title, content, summary,
                 word_count, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(story_id, chapter_num) DO UPDATE SET
                id         = excluded.id,
                title      = excluded.title,
                content    = excluded.content,
                summary    = excluded.summary,
                word_count = excluded.word_count,
                created_at = excluded.created_at
        """, (chapter_id, story_id, chapter_num, title, content,
              summary, word_count, now))

        # Mark story as complete if this is the last chapter.
        story = get_story(story_id)
        if story and chapter_num >= story["total_chapters"]:
            conn.execute(
                "UPDATE stories SET status='complete', updated_at=? WHERE id=?",
                (now, story_id),
            )
        else:
            conn.execute(
                "UPDATE stories SET updated_at=? WHERE id=?",
                (now, story_id),
            )

    return get_chapter_by_num(story_id, chapter_num)


# ---------------------------------------------------------------------------
# Character helpers
# ---------------------------------------------------------------------------

def get_characters(story_id: str) -> list[dict]:
    """Return all characters for a story."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM characters WHERE story_id = ? ORDER BY created_at",
            (story_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_character(char_id: str) -> dict | None:
    """Return a single character by id."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM characters WHERE id = ?", (char_id,)
        ).fetchone()
    return dict(row) if row else None


def create_character(story_id: str, data: dict) -> dict:
    """Create and return a new character."""
    char_id = _new_id()
    now = _now()
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO characters
                (id, story_id, name, role, description, traits, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            char_id,
            story_id,
            data.get("name", "Unknown"),
            data.get("role", ""),
            data.get("description", ""),
            data.get("traits", ""),
            data.get("notes", ""),
            now,
        ))
    return get_character(char_id)


def update_character(char_id: str, data: dict) -> dict | None:
    """Update mutable character fields."""
    allowed = {"name", "role", "description", "traits", "notes"}
    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        return get_character(char_id)

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [char_id]
    with get_conn() as conn:
        conn.execute(
            f"UPDATE characters SET {set_clause} WHERE id = ?", values
        )
    return get_character(char_id)


def delete_character(char_id: str) -> bool:
    """Delete a character by id."""
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM characters WHERE id = ?", (char_id,))
    return cur.rowcount > 0


# ---------------------------------------------------------------------------
# Adventure node helpers
# ---------------------------------------------------------------------------

def get_node(node_id: str) -> dict | None:
    """Return a single adventure node."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM adventure_nodes WHERE id = ?", (node_id,)
        ).fetchone()
    return dict(row) if row else None


def get_node_ancestors(node_id: str) -> list[dict]:
    """
    Walk up the parent chain and return ancestors ordered root→node.
    Limited to 20 hops to guard against cycles.
    """
    ancestors = []
    current_id = node_id
    with get_conn() as conn:
        for _ in range(20):
            row = conn.execute(
                "SELECT * FROM adventure_nodes WHERE id = ?", (current_id,)
            ).fetchone()
            if row is None:
                break
            ancestors.append(dict(row))
            current_id = row["parent_id"]
            if current_id is None:
                break
    ancestors.reverse()
    return ancestors


def save_adventure_node(story_id: str, parent_id: str | None,
                        content: str, choices: list[dict],
                        depth: int) -> dict:
    """Insert an adventure node and return it."""
    node_id = _new_id()
    now = _now()
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO adventure_nodes
                (id, story_id, parent_id, content, choices_json, depth, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (node_id, story_id, parent_id,
              content, json.dumps(choices), depth, now))
    return get_node(node_id)


# ---------------------------------------------------------------------------
# Chat message helpers
# ---------------------------------------------------------------------------

def get_chat_messages(story_id: str, limit: int = 40) -> list[dict]:
    """Return the most recent chat messages for a story (oldest first)."""
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT * FROM chat_messages
            WHERE story_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        """, (story_id, limit)).fetchall()
    rows_list = [dict(r) for r in rows]
    rows_list.reverse()  # oldest first
    return rows_list


def save_chat_message(story_id: str, role: str, content: str) -> dict:
    """Persist a chat message and return it."""
    msg_id = _new_id()
    now = _now()
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO chat_messages (id, story_id, role, content, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (msg_id, story_id, role, content, now))
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM chat_messages WHERE id = ?", (msg_id,)
        ).fetchone()
    return dict(row)


# ---------------------------------------------------------------------------
# Rich context builder (used by AI prompts)
# ---------------------------------------------------------------------------

def get_story_context(story_id: str) -> dict | None:
    """
    Return a composite dict containing the story metadata plus a list of
    chapter summaries (not full content) suitable for feeding into prompts.
    """
    story = get_story(story_id)
    if story is None:
        return None

    # Parse characters JSON back to Python list
    try:
        story["characters_parsed"] = json.loads(story.get("characters_json", "[]"))
    except (json.JSONDecodeError, TypeError):
        story["characters_parsed"] = []

    # Chapter summaries only (keeps prompt size manageable)
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT chapter_num, title, summary, word_count
            FROM chapters
            WHERE story_id = ?
            ORDER BY chapter_num
        """, (story_id,)).fetchall()
    story["chapter_summaries"] = [dict(r) for r in rows]

    # Characters from the characters table (may differ from characters_json)
    story["db_characters"] = get_characters(story_id)

    return story
