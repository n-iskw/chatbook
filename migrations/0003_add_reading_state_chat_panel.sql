-- Whether the chat sat beside the page, saved with the rest of the place now
-- that the address bar no longer carries it. NULL is "no wide screen has said
-- either way", which is not "closed": the chat starts open where there is room
-- for it, and a narrow screen leaves this alone — there the chat is a sheet
-- over the page rather than a pane next to it.
ALTER TABLE pdfs ADD COLUMN last_read_chat_panel_open INTEGER;
