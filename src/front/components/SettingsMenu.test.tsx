import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider, createStore } from "jotai";
import { SettingsMenu } from "./SettingsMenu";
import { useWebSearchAtom } from "../atoms/chatAtom";

function renderMenu() {
  const store = createStore();
  render(
    <Provider store={store}>
      <SettingsMenu />
    </Provider>,
  );
  return store;
}

describe("SettingsMenu", () => {
  it("turns web search off from the settings menu", async () => {
    const store = renderMenu();

    await userEvent.click(screen.getByRole("button", { name: "設定" }));
    const toggle = screen.getByRole("checkbox", { name: "Web検索" });
    expect(toggle).toBeChecked();

    await userEvent.click(toggle);

    expect(store.get(useWebSearchAtom)).toBe(false);
  });
});
