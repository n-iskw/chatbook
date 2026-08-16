/**
 * An XMLHttpRequest the test drives by hand.
 *
 * Uploading a book is the one request that does not go through `fetch`: only
 * XHR can say how much of the body has gone up, which is what the reader
 * watches while a 22MB book leaves a phone. Tests of that path need a request
 * whose progress and answer they decide, so this stands in for the browser's.
 */
export function fakeUpload() {
  const upload = new EventTarget();
  const request = new EventTarget() as unknown as XMLHttpRequest;
  let opened: [string, string] | null = null;
  let sent: unknown = null;

  Object.assign(request, {
    upload,
    status: 0,
    responseText: "",
    open: (method: string, url: string) => {
      opened = [method, url];
    },
    send: (body: unknown) => {
      sent = body;
    },
  });

  const mutable = request as unknown as { status: number; responseText: string };

  return {
    /** Handed to the code under test in place of the browser's request. */
    request,
    /** The method and url it was opened with, once it has been. */
    openedWith: () => opened,
    /** The body it was given to send. */
    sentBody: () => sent,
    /** How far the browser says the upload has got. */
    uploaded: (loaded: number, total: number) =>
      upload.dispatchEvent(
        Object.assign(new Event("progress"), { lengthComputable: true, loaded, total }),
      ),
    /** The server's answer, once the whole body is in. */
    answers: (body: unknown, status = 200) => {
      mutable.status = status;
      mutable.responseText = JSON.stringify(body);
      request.dispatchEvent(new Event("load"));
    },
    /** A request that never reached the server. */
    refusesToConnect: () => request.dispatchEvent(new Event("error")),
  };
}
