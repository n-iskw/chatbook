import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider, createStore } from "jotai";
import { SettingsMenu } from "./SettingsMenu";
import { useWebSearchAtom, keybindingModeAtom } from "../atoms/settingsAtom";
import type { KeybindingMode } from "../lib/keybindings";

function renderMenu(mode: KeybindingMode = "vim") {
  const store = createStore();
  store.set(keybindingModeAtom, mode);
  render(
    <Provider store={store}>
      <SettingsMenu />
    </Provider>,
  );
  return store;
}

describe("SettingsMenu", () => {
  it("shows web search already on, since the assistant falls back to the web by default", async () => {
    renderMenu();

    await userEvent.click(screen.getByRole("button", { name: "設定" }));

    expect(screen.getByRole("checkbox", { name: "Web検索" })).toBeChecked();
  });

  it("turns web search off from the settings menu", async () => {
    const store = renderMenu();
    await userEvent.click(screen.getByRole("button", { name: "設定" }));

    await userEvent.click(screen.getByRole("checkbox", { name: "Web検索" }));

    expect(store.get(useWebSearchAtom)).toBe(false);
  });

  it("says what the arrow keys do, with no bindings chosen and they answer anyway", async () => {
    renderMenu("none");
    await userEvent.click(screen.getByRole("button", { name: "設定" }));

    expect(describedKey("←/→")).toBe("前 / 次のページ");
    expect(describedKey("↑/↓")).toBe("スクロール");
  });

  // Whole list rather than a key at a time: the arrows lead because they hold
  // in every mode, and a mode's own keys must not be offered to a reader who
  // has turned that mode off — pressing them would do nothing.
  it.each([
    ["none", ["←/→", "↑/↓"]],
    ["vim", ["←/→", "↑/↓", "l", "h", "j", "k", "t", "gg", "G"]],
    ["emacs", ["←/→", "↑/↓", "C-n", "C-p", "C-c t", "M-<", "M->"]],
  ] as [KeybindingMode, string[]][])(
    "lists %s mode's keys under the arrows",
    async (mode, keys) => {
      renderMenu(mode);
      await userEvent.click(screen.getByRole("button", { name: "設定" }));

      expect(screen.getAllByRole("term").map((term) => term.textContent)).toStrictEqual(keys);
    },
  );
});

/** What the menu says a key does, read from the `dd` beside its `kbd`. */
function describedKey(keys: string): string | null {
  const term = screen.getByText(keys).closest("dt");
  return term?.nextElementSibling?.textContent ?? null;
}
