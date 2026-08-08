import { describe, it, expect } from "vite-plus/test";
import { parseTextFragment, passageFromNavigation } from "./textFragment";

describe("parseTextFragment", () => {
  it("reads the quoted passage out of a text fragment", () => {
    expect(
      parseTextFragment("#:~:text=%E3%82%A8%E3%83%83%E3%82%B8%E3%81%AF%E9%80%9F%E3%81%84"),
    ).toBe("エッジは速い");
  });

  it("takes the start of a range the browser wrote as start,end", () => {
    expect(parseTextFragment("#:~:text=Workers%20is,global%20network")).toBe("Workers is");
  });

  it("ignores the context words the browser adds as prefix- and -suffix", () => {
    expect(parseTextFragment("#:~:text=before-,Workers,-after")).toBe("Workers");
  });

  it("reads a text fragment that follows an ordinary anchor", () => {
    expect(parseTextFragment("#page3:~:text=Workers")).toBe("Workers");
  });

  it("keeps a passage whose own text contains a comma and a dash", () => {
    const passage = "Workers, つまり -エッジ- で動く";

    expect(parseTextFragment(`#:~:text=${encodeURIComponent(passage)}`)).toBe(passage);
  });

  it("returns null for a hash that carries no text fragment", () => {
    expect(parseTextFragment("#section-1")).toBeNull();
  });

  it("returns null when there is no hash at all", () => {
    expect(parseTextFragment("")).toBeNull();
  });
});

describe("passageFromNavigation", () => {
  // The browser hides the fragment directive from location.hash, so the URL the
  // document was requested with is the only place left to read it from
  it("recovers the passage from the URL the document was requested with", () => {
    const entries = [
      {
        name: `http://localhost/books/01JBOOK#:~:text=${encodeURIComponent("エッジは速い")}`,
      },
    ];

    expect(passageFromNavigation(entries)).toBe("エッジは速い");
  });

  it("returns null when the page was opened without a text fragment", () => {
    expect(passageFromNavigation([{ name: "http://localhost/books/01JBOOK?page=3" }])).toBeNull();
  });

  it("returns null when there is no navigation entry to read", () => {
    expect(passageFromNavigation([])).toBeNull();
  });
});
