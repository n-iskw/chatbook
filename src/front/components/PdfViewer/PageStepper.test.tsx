import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider, createStore } from "jotai";
import { PageStepper } from "./PageStepper";
import { currentPageAtom } from "../../atoms/pdfAtom";

/** As many pages as the fixture book has, which is an even number. */
const PAGE_COUNT = 12;

/** Two pages up, which is what the wide layout shows when there is room. */
const SPREAD = 2;

function renderStepper(currentPage: number, step?: number) {
  const store = createStore();
  store.set(currentPageAtom, currentPage);

  render(
    <Provider store={store}>
      <PageStepper pageCount={PAGE_COUNT} step={step} />
    </Provider>,
  );

  return store;
}

describe("PageStepper", () => {
  it("names the one page it is on when one page is up", () => {
    renderStepper(7);

    expect(screen.getByText("7 / 12", { exact: true })).toBeInTheDocument();
  });

  it("names both pages it is on when a spread is up", () => {
    renderStepper(7, SPREAD);

    expect(screen.getByText("7-8 / 12", { exact: true })).toBeInTheDocument();
  });

  it("names the last page alone when the spread it is on has no second page", () => {
    renderStepper(PAGE_COUNT, SPREAD);

    expect(screen.getByText("12 / 12", { exact: true })).toBeInTheDocument();
  });

  it("moves on by the whole spread", async () => {
    const store = renderStepper(7, SPREAD);

    await userEvent.click(screen.getByRole("button", { name: "次のページ" }));

    expect(store.get(currentPageAtom)).toBe(9);
    expect(screen.getByText("9-10 / 12", { exact: true })).toBeInTheDocument();
  });

  it("moves back by the whole spread", async () => {
    const store = renderStepper(9, SPREAD);

    await userEvent.click(screen.getByRole("button", { name: "前のページ" }));

    expect(store.get(currentPageAtom)).toBe(7);
  });

  it("spends its last step on the page left over at the end of the book", async () => {
    // [10|11] is where a link lands rather than where reading forward goes, and
    // 12 is a page the reader has not seen: the control has to reach it.
    const store = renderStepper(10, SPREAD);

    await userEvent.click(screen.getByRole("button", { name: "次のページ" }));

    expect(store.get(currentPageAtom)).toBe(PAGE_COUNT);
  });

  it("has nothing left to step to on the last spread of the book", async () => {
    renderStepper(11, SPREAD);

    // The control says so rather than silently doing nothing when pressed
    expect(screen.getByRole("button", { name: "次のページ" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "前のページ" })).toBeEnabled();
  });

  it("has nothing left to step back to on the first page", () => {
    renderStepper(1, SPREAD);

    expect(screen.getByRole("button", { name: "前のページ" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "次のページ" })).toBeEnabled();
  });
});
