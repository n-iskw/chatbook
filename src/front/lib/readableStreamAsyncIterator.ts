/**
 * WebKit has never shipped async iteration of ReadableStream (iOS/iPadOS
 * Safari still lacks it as of 26.x; desktop Safari gained it in 27), while
 * pdf.js v6 consumes the getTextContent stream with `for await`. Without
 * this the loop's entry throws `undefined is not a function` on every
 * page of every book opened from an iPad.
 *
 * The generator mirrors the spec's default behaviour: read to the end,
 * cancel the stream when the loop exits early, and always give the lock
 * back.
 */

type ChunkReader<T> = {
  read(): Promise<{ done: boolean; value?: T }>;
  cancel(reason?: unknown): Promise<unknown>;
  releaseLock(): void;
};

type InstallTarget<T> = {
  prototype: {
    [Symbol.asyncIterator]?: () => AsyncIterator<T>;
    getReader(): ChunkReader<T>;
  };
};

export function installReadableStreamAsyncIterator<T>(ctor: InstallTarget<T>): void {
  if (ctor.prototype[Symbol.asyncIterator]) return;

  ctor.prototype[Symbol.asyncIterator] = async function* () {
    const reader = this.getReader();
    let drained = false;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          drained = true;
          return;
        }
        yield value as T;
      }
    } finally {
      // An errored stream rejects cancel() with its stored error; the loop is
      // already rethrowing that from read(), so a second copy is noise — and
      // letting it escape here would skip releaseLock and replace the error.
      if (!drained) await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  };
}
