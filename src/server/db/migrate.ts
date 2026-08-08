const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS pdfs (
  id          TEXT PRIMARY KEY,
  file_path   TEXT NOT NULL UNIQUE,
  file_name   TEXT NOT NULL,
  file_hash   TEXT NOT NULL UNIQUE,
  full_text   TEXT NOT NULL,
  page_count  INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS selections (
  id             TEXT PRIMARY KEY,
  pdf_id         TEXT NOT NULL REFERENCES pdfs(id) ON DELETE CASCADE,
  selected_text  TEXT NOT NULL,
  page_number    INTEGER NOT NULL,
  position_data  TEXT NOT NULL,
  color          TEXT NOT NULL DEFAULT '#FFEB3B',
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_selections_pdf_id ON selections(pdf_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id            TEXT PRIMARY KEY,
  selection_id  TEXT NOT NULL REFERENCES selections(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content       TEXT NOT NULL,
  citations     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_selection_id ON chat_messages(selection_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_selection_time ON chat_messages(selection_id, created_at);
`;

let migrated = false;

/**
 * Apply D1 migrations if not already applied.
 * Uses CREATE TABLE IF NOT EXISTS for idempotency.
 */
export async function applyMigrations(db: D1Database): Promise<void> {
  if (migrated) return;

  const statements = MIGRATION_SQL
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    try {
      await db.prepare(stmt).run();
    } catch (err) {
      console.error("Migration statement failed:", stmt.substring(0, 80), err);
    }
  }

  migrated = true;
}
