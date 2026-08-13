import { describe, it, expect, afterEach } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider, createStore } from "jotai";
import { errAsync, type ResultAsync } from "neverthrow";
import { SettingsMenu } from "./SettingsMenu";
import { useWebSearchAtom, keybindingModeAtom } from "../atoms/settingsAtom";
import { ApiError } from "../lib/fetcher";
import type { SessionEnded } from "../../shared/schemas/auth";
import type { KeybindingMode } from "../lib/keybindings";

function renderMenu(
  mode: KeybindingMode = "vim",
  endSession?: () => ResultAsync<SessionEnded, ApiError>,
) {
  const store = createStore();
  store.set(keybindingModeAtom, mode);
  render(
    <Provider store={store}>
      <SettingsMenu endSession={endSession} />
    </Provider>,
  );
  return store;
}

describe("SettingsMenu", () => {
  // The settings outlive the store they are read through: they sit in
  // localStorage so they survive a change of book. A test that turns one off
  // therefore hands it to whichever test runs next, which would make the
  // default-on test below pass or fail on the declaration order alone.
  afterEach(() => {
    localStorage.clear();
  });

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

  it("says why the session could not be ended, rather than looking logged out", async () => {
    // The reader would otherwise be shown the shelf again with the cookie still
    // on it, having been told nothing — on a borrowed laptop that is the worst
    // possible time to assume it worked.
    renderMenu("vim", () =>
      errAsync(new ApiError("Failed to fetch", "NETWORK_ERROR", 0, "network")),
    );
    await userEvent.click(screen.getByRole("button", { name: "設定" }));

    await userEvent.click(screen.getByRole("button", { name: "ログアウト" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /^ログアウトできませんでした: Failed to fetch$/,
    );
    // Still open, so the reader can try again without hunting for the menu
    expect(screen.getByRole("button", { name: "ログアウト" })).toBeInTheDocument();
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
    ["emacs", ["←/→", "↑/↓", "C-f", "C-b", "C-n", "C-p", "C-c t", "M-<", "M->"]],
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
