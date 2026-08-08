export interface SseEvent {
  event: string;
  data: unknown;
}

/**
 * Create a stateful parser for a Server-Sent Events body.
 *
 * Feed it decoded chunks; it returns the events that became complete with that
 * chunk. Blocks are delimited by a blank line, so an `event:` line is always
 * paired with the `data:` line from the same block — scanning the whole buffer
 * for a matching `data:` would mix up events that arrive together.
 */
export function createSseParser(): (chunk: string) => SseEvent[] {
  let buffer = "";

  return function parse(chunk: string): SseEvent[] {
    buffer += chunk;

    const events: SseEvent[] = [];
    const blocks = buffer.split("\n\n");
    // The trailing piece may be an unfinished block; keep it for the next chunk
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      let event: string | null = null;
      let rawData: string | null = null;

      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) {
          event = line.slice("event:".length).trim();
        } else if (line.startsWith("data:")) {
          rawData = line.slice("data:".length).trim();
        }
      }

      if (!event || rawData === null) continue;

      try {
        events.push({ event, data: JSON.parse(rawData) });
      } catch {
        // A malformed block must not abort the rest of the stream
      }
    }

    return events;
  };
}
