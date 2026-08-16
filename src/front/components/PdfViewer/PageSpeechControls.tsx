// oxlint-disable-next-line no-restricted-imports -- Mac音声とブラウザ音声の状態同期、および速度設定の同期に必要
import { useEffect, useRef, useState } from "react";
import { useSpeechSynthesis } from "../../hooks/useSpeechSynthesis";
import { useMacSpeech } from "../../lib/macSpeechBridge";

interface PageSpeechControlsProps {
  text: string;
  pageNumber: number;
}

type SpeechMode = "mac-selection" | "browser" | null;

export function PageSpeechControls({ text, pageNumber }: PageSpeechControlsProps) {
  const mac = useMacSpeech(text);
  const browser = useSpeechSynthesis(text);
  const [mode, setMode] = useState<SpeechMode>(null);
  const modeRef = useRef<SpeechMode>(null);
  const speechTextRef = useRef<HTMLTextAreaElement>(null);
  const [rate, setRate] = useState(1);
  const status = mode === "browser" ? browser.status : mode ? "speaking" : "idle";

  useEffect(() => {
    browser.setRate(rate);
    mac.setRate(rate);
  }, [browser.setRate, mac.setRate, rate]);

  useEffect(() => {
    if (mode === "browser" && browser.status === "idle") setMode(null);
  }, [browser.status, mode]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // The system shortcut is a toggle, so send it only when this page is
  // actually being replaced/unmounted. Keeping `mode` out of this effect's
  // dependencies avoids sending the toggle twice when the stop button is used.
  useEffect(
    () => () => {
      if (modeRef.current === "mac-selection") void mac.stopSelection();
    },
    [mac.stopSelection, pageNumber, text],
  );

  if (!text.trim() || (!mac.available && !browser.supported)) return null;

  const speak = async () => {
    const speechText = speechTextRef.current;
    const pageTextSelected = Boolean(speechText && text.trim());
    if (pageTextSelected) {
      // Keep the PDF's real text selection untouched. The off-screen textarea
      // gives macOS Speak selection a focused, selected text source without
      // opening chatbook's selection popover or context-menu flow.
      window.getSelection()?.removeAllRanges();
      speechText?.focus({ preventScroll: true });
      speechText?.select();
    }

    if (mac.available) {
      if (pageTextSelected && (await mac.speakSelection())) {
        setMode("mac-selection");
      }
    } else {
      browser.speak();
      setMode("browser");
    }
  };

  const pause = () => {
    browser.pause();
  };

  const resume = () => {
    browser.resume();
  };

  const stop = () => {
    if (mode === "mac-selection") void mac.stopSelection();
    else browser.stop();
    setMode(null);
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white/95 px-2 py-1.5 shadow-sm">
      <textarea
        ref={speechTextRef}
        value={text}
        readOnly
        tabIndex={-1}
        aria-label={`読み上げ対象の${pageNumber}ページ`}
        className="fixed -left-[10000px] top-0 h-px w-px opacity-0"
      />
      <button
        type="button"
        aria-label={`現在の${pageNumber}ページを読み上げ`}
        onClick={
          mode === "mac-selection"
            ? stop
            : status === "idle"
              ? speak
              : status === "speaking"
                ? pause
                : resume
        }
        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
      >
        {mode === "mac-selection"
          ? "macOSで再生中（停止）"
          : status === "idle"
            ? "このページを読む"
            : status === "speaking"
              ? "一時停止"
              : "再開"}
      </button>
      {status !== "idle" && mode !== "mac-selection" && (
        <button
          type="button"
          aria-label="ページ読み上げを停止"
          onClick={stop}
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          停止
        </button>
      )}
      {mac.available ? (
        <span className="text-xs text-gray-500">速度: macOS設定</span>
      ) : (
        <label className="flex items-center gap-1 text-xs text-gray-500">
          速度
          <select
            aria-label="ページ読み上げ速度"
            value={rate}
            onChange={(event) => setRate(Number(event.target.value))}
            className="rounded border border-gray-300 bg-white px-1 py-1 text-xs text-gray-700"
          >
            <option value="0.75">0.75倍</option>
            <option value="1">1倍</option>
            <option value="1.25">1.25倍</option>
            <option value="1.5">1.5倍</option>
          </select>
        </label>
      )}
      {mac.error && (
        <span role="alert" className="text-xs text-red-600">
          {mac.error}
        </span>
      )}
    </div>
  );
}
