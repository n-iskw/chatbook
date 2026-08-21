import { describe, expect, it } from "vitest";
import { installReadableStreamAsyncIterator } from "./readableStreamAsyncIterator";

/**
 * A stand-in for Safari's ReadableStream: `getReader()` works, but the
 * prototype has no Symbol.asyncIterator. The reader records how the loop
 * let go of it (drained to the end, or cancelled mid-way).
 */
function streamWithoutAsyncIterator(chunks: string[]) {
  const record = {
    cancelled: [] as unknown[],
    released: false,
  };
  class FakeReader {
    #remaining = [...chunks];
    read() {
      return this.#remaining.length > 0
        ? Promise.resolve({ done: false as const, value: this.#remaining.shift() })
        : Promise.resolve({ done: true as const, value: undefined });
    }
    cancel(reason?: unknown) {
      record.cancelled.push(reason);
      return Promise.resolve();
    }
    releaseLock() {
      record.released = true;
    }
  }
  class FakeStream {
    getReader() {
      return new FakeReader();
    }
  }
  return { ctor: FakeStream, stream: new FakeStream(), record };
}

describe("installReadableStreamAsyncIterator", () => {
  it("installing on a stream class without Symbol.asyncIterator makes for-await yield every chunk in read order", async () => {
    const { ctor, stream } = streamWithoutAsyncIterator(["first", "second", "third"]);

    installReadableStreamAsyncIterator(ctor);

    const seen: string[] = [];
    for await (const chunk of stream as unknown as AsyncIterable<string>) {
      seen.push(chunk);
    }
    expect(seen).toStrictEqual(["first", "second", "third"]);
  });

  it("a loop that runs to the end releases the reader without cancelling the stream", async () => {
    const { ctor, stream, record } = streamWithoutAsyncIterator(["only"]);

    installReadableStreamAsyncIterator(ctor);

    for await (const _chunk of stream as unknown as AsyncIterable<string>) {
      // drain
    }
    expect(record).toStrictEqual({ cancelled: [], released: true });
  });

  it("breaking out of the loop early cancels the stream and releases the reader", async () => {
    const { ctor, stream, record } = streamWithoutAsyncIterator(["first", "second"]);

    installReadableStreamAsyncIterator(ctor);

    const seen: string[] = [];
    for await (const chunk of stream as unknown as AsyncIterable<string>) {
      seen.push(chunk);
      break;
    }
    expect(seen).toStrictEqual(["first"]);
    expect(record).toStrictEqual({ cancelled: [undefined], released: true });
  });

  it("a stream that errors mid-read rejects the loop with the stream's own error and still releases the reader", async () => {
    const streamError = new Error("boom");
    const record = { released: false };
    class ErroringReader {
      read() {
        return Promise.reject(streamError);
      }
      cancel() {
        // An errored stream rejects cancel() with its stored error, too.
        return Promise.reject(new Error("cancel-boom"));
      }
      releaseLock() {
        record.released = true;
      }
    }
    class ErroringStream {
      getReader() {
        return new ErroringReader();
      }
    }

    installReadableStreamAsyncIterator(ErroringStream);

    const drain = async () => {
      for await (const _chunk of new ErroringStream() as unknown as AsyncIterable<string>) {
        // never reached
      }
    };
    await expect(drain()).rejects.toBe(streamError);
    expect(record).toStrictEqual({ released: true });
  });

  it("installing where the runtime already ships Symbol.asyncIterator leaves the native function untouched", () => {
    const native = ReadableStream.prototype[Symbol.asyncIterator];
    expect(typeof native).toBe("function");

    installReadableStreamAsyncIterator(ReadableStream);

    expect(ReadableStream.prototype[Symbol.asyncIterator]).toBe(native);
  });
});
