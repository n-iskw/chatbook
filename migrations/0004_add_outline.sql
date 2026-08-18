-- Top-level table of contents as the client extracted it: a JSON array of
-- { title, pageNumber } marking where each chapter starts. Chat trims the
-- document it sends to the chapter holding the highlight; NULL (books stored
-- before this column, or books whose PDF ships no outline) falls back to a
-- page window around the highlight instead.
ALTER TABLE pdfs ADD COLUMN outline TEXT;
