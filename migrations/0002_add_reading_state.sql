-- Where the reader left off, so a book opened on another device resumes there.
-- Nullable with no default: a book nobody has read has no place to return to,
-- which is not the same as being on page 1.
ALTER TABLE pdfs ADD COLUMN last_read_page INTEGER;
-- No foreign key: a highlight can be deleted while another device still names
-- it, and the reader is served the list rather than an error either way.
ALTER TABLE pdfs ADD COLUMN last_read_selection_id TEXT;
-- NULL is "no wide screen has said either way", which is not "closed": the
-- outline starts open where there is room for it beside the page.
ALTER TABLE pdfs ADD COLUMN last_read_outline_open INTEGER;
