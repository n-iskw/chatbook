-- What each answer cost, so the reused part of the prompt can be measured.
-- Nullable with no default: rows written before this migration are "not
-- measured", which is not the same as "cost nothing".
ALTER TABLE chat_messages ADD COLUMN input_tokens INTEGER;
ALTER TABLE chat_messages ADD COLUMN output_tokens INTEGER;
ALTER TABLE chat_messages ADD COLUMN cached_input_tokens INTEGER;
