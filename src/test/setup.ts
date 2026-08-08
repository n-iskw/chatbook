import "@testing-library/jest-dom/vitest";

// jsdom has no layout engine, so it ships no scrollIntoView. Components that
// keep a conversation pinned to the bottom would throw on mount without it.
Element.prototype.scrollIntoView = () => {};
