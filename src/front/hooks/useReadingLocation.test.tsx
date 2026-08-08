import { describe, it, expect } from "vite-plus/test";
import { renderHook, act, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { Provider, createStore, useSetAtom } from "jotai";
import type { ReactNode } from "react";
import { useReadingLocation, type LocatePassage } from "./useReadingLocation";
import { currentPageAtom } from "../atoms/pdfAtom";

const PDF_ID = "01JBOOK";

/** Exposes the URL the hook drives and a way to turn pages like the viewer does. */
function useHarness(locatePassage: LocatePassage, linkedPassage: string | null) {
  useReadingLocation(PDF_ID, locatePassage, linkedPassage);
  return { search: useLocation().search, setCurrentPage: useSetAtom(currentPageAtom) };
}

function renderAt(
  url: string,
  options: { locatePassage?: LocatePassage; linkedPassage?: string | null } = {},
) {
  const { locatePassage = async () => null, linkedPassage = null } = options;
  const store = createStore();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
    </Provider>
  );

  return { store, view: renderHook(() => useHarness(locatePassage, linkedPassage), { wrapper }) };
}

describe("useReadingLocation", () => {
  it("opens the page named in the URL so a reload resumes where the reader left off", () => {
    const { store } = renderAt(`/books/${PDF_ID}?page=42`);

    expect(store.get(currentPageAtom)).toBe(42);
  });

  it("writes the page into the URL when the reader turns to it", async () => {
    const { store, view } = renderAt(`/books/${PDF_ID}?page=1`);

    act(() => view.result.current.setCurrentPage(7));

    await waitFor(() => expect(view.result.current.search).toBe("?page=7"));
    expect(store.get(currentPageAtom)).toBe(7);
  });

  it("stays on the page it was given instead of bouncing back to the first one", async () => {
    const { store, view } = renderAt(`/books/${PDF_ID}?page=20`);

    await waitFor(() => expect(view.result.current.search).toBe("?page=20"));
    expect(store.get(currentPageAtom)).toBe(20);
  });

  it("opens the page holding the passage of a browser text-fragment link", async () => {
    const { store } = renderAt(`/books/${PDF_ID}`, {
      linkedPassage: "エッジは速い",
      locatePassage: async (_pdfId, passage) => (passage === "エッジは速い" ? 88 : null),
    });

    await waitFor(() => expect(store.get(currentPageAtom)).toBe(88));
  });

  it("stays on the first page when the linked passage is not found in the book", async () => {
    const { store, view } = renderAt(`/books/${PDF_ID}`, {
      linkedPassage: "missing",
      locatePassage: async () => null,
    });

    await waitFor(() => expect(view.result.current.search).toBe("?page=1"));
    expect(store.get(currentPageAtom)).toBe(1);
  });
});
