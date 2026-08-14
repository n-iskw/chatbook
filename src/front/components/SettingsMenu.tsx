// oxlint-disable-next-line no-restricted-imports -- document への keydown / mousedown 購読 (Escape と外側クリックで閉じる) に必要
import { useState, useRef, useEffect } from "react";
import { useAtom } from "jotai";
import { keybindingModeAtom } from "../atoms/settingsAtom";
import { useWebSearchAtom } from "../atoms/settingsAtom";
import { ARROW_KEYBINDING_HELP, KEYBINDING_HELP, type KeybindingMode } from "../lib/keybindings";
import type { ResultAsync } from "neverthrow";
import { resultFetcher, type ApiError } from "../lib/fetcher";
import { sessionEndedSchema, type SessionEnded } from "../../shared/schemas/auth";
import { useServerConfig } from "../hooks/useServerConfig";

const MODE_LABELS: Record<KeybindingMode, string> = {
  none: "なし",
  vim: "Vim",
  emacs: "Emacs",
};

interface SettingsMenuProps {
  /** Injectable so a session that could not be ended can be driven in a test. */
  endSession?: () => ResultAsync<SessionEnded, ApiError>;
}

export function SettingsMenu({ endSession = requestSessionEnd }: SettingsMenuProps = {}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useAtom(keybindingModeAtom);
  const [useWebSearch, setUseWebSearch] = useAtom(useWebSearchAtom);
  const { webSearchAvailable } = useServerConfig();
  const [logOutError, setLogOutError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const logOut = async () => {
    setLogOutError(null);

    const ended = await endSession();
    if (ended.isErr()) {
      // Left signed in and told so: the cookie is still on the browser, and a
      // reader who thinks they are out would walk away from an open book.
      setLogOutError(`ログアウトできませんでした: ${ended.error.message}`);
      return;
    }

    // The reload is what puts the password box back: the cookie is gone, so the
    // next thing the gate asks gets a 401, and every piece of the book on
    // screen — which all came from behind that cookie — goes with it.
    window.location.assign("/");
  };

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  // The arrows first because they hold in every mode, the chosen mode's own
  // keys under them — including when that choice is to have none.
  const help = [...ARROW_KEYBINDING_HELP, ...(mode === "none" ? [] : KEYBINDING_HELP[mode])];

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-label="設定"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded px-2 py-1 text-lg leading-none text-gray-600 hover:bg-gray-200 cursor-pointer"
      >
        ⚙
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
          {/* Hidden rather than disabled when the provider has no web search:
              the server turns such a request into an ordinary one anyway, so a
              switch here would be one the reader could flip to no effect. */}
          {webSearchAvailable ? (
            <fieldset className="mb-3 border-b border-gray-100 pb-3">
              <legend className="mb-2 text-xs font-semibold text-gray-500">チャット</legend>
              <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-gray-700 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={useWebSearch}
                  onChange={(e) => setUseWebSearch(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Web検索
              </label>
            </fieldset>
          ) : null}

          <fieldset>
            <legend className="mb-2 text-xs font-semibold text-gray-500">キーバインド</legend>
            <div className="flex flex-col gap-1">
              {(Object.keys(MODE_LABELS) as KeybindingMode[]).map((value) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <input
                    type="radio"
                    name="keybinding-mode"
                    value={value}
                    checked={mode === value}
                    onChange={() => setMode(value)}
                    className="h-3.5 w-3.5"
                  />
                  {MODE_LABELS[value]}
                </label>
              ))}
            </div>
          </fieldset>

          <dl className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-600">
            {help.map(([keys, description]) => (
              <div key={keys} className="flex items-baseline justify-between py-0.5">
                <dt>
                  <kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px]">
                    {keys}
                  </kbd>
                </dt>
                <dd>{description}</dd>
              </div>
            ))}
          </dl>

          {/* Here because this menu is the one thing on screen in both layouts,
              wide and narrow, so there is one way out rather than two. */}
          <div className="mt-3 border-t border-gray-100 pt-2">
            <button
              type="button"
              onClick={() => void logOut()}
              className="w-full rounded px-1 py-1 text-left text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
            >
              ログアウト
            </button>
            {logOutError !== null && (
              <p role="alert" className="px-1 pt-1 text-xs text-red-600">
                {logOutError}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Asks the server to take the session back. */
function requestSessionEnd(): ResultAsync<SessionEnded, ApiError> {
  return resultFetcher("/api/auth/logout", sessionEndedSchema, { method: "POST" });
}
