CREATE TABLE pdfs (
  id          TEXT PRIMARY KEY,
  file_path   TEXT NOT NULL UNIQUE,
  file_name   TEXT NOT NULL,
  file_hash   TEXT NOT NULL UNIQUE,
  full_text   TEXT NOT NULL,
  page_count  INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE selections (
  id             TEXT PRIMARY KEY,
  pdf_id         TEXT NOT NULL REFERENCES pdfs(id) ON DELETE CASCADE,
  selected_text  TEXT NOT NULL,
  page_number    INTEGER NOT NULL,
  position_data  TEXT NOT NULL,
  color          TEXT NOT NULL DEFAULT '#FFEB3B',
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_selections_pdf_id ON selections(pdf_id);

CREATE TABLE chat_messages (
  id            TEXT PRIMARY KEY,
  selection_id  TEXT NOT NULL REFERENCES selections(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content       TEXT NOT NULL,
  citations     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_chat_messages_selection_id ON chat_messages(selection_id);
CREATE INDEX idx_chat_messages_selection_time ON chat_messages(selection_id, created_at);
