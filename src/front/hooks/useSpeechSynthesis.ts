// oxlint-disable-next-line no-restricted-imports -- 発話テキスト変更時とコンポーネント破棄時に読み上げを停止する購読に必要
import { useCallback, useEffect, useRef, useState } from "react";

export type SpeechStatus = "idle" | "speaking" | "paused";

function speechSynthesisOf(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis;
}

export function speechSynthesisSupported(): boolean {
  return (
    speechSynthesisOf() !== null &&
    typeof window !== "undefined" &&
    "SpeechSynthesisUtterance" in window
  );
}

export function useSpeechSynthesis(text: string) {
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [rate, setRate] = useState(1);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stop = useCallback(() => {
    speechSynthesisOf()?.cancel();
    utteranceRef.current = null;
    setStatus("idle");
  }, []);

  useEffect(() => stop, [stop, text]);

  const speak = useCallback(() => {
    const speechSynthesis = speechSynthesisOf();
    if (!speechSynthesis || !speechSynthesisSupported() || !text.trim()) return;

    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.rate = rate;
    utterance.onstart = () => setStatus("speaking");
    utterance.onpause = () => setStatus("paused");
    utterance.onresume = () => setStatus("speaking");
    utterance.onend = () => {
      if (utteranceRef.current === utterance) {
        utteranceRef.current = null;
        setStatus("idle");
      }
    };
    utterance.onerror = () => {
      if (utteranceRef.current === utterance) {
        utteranceRef.current = null;
        setStatus("idle");
      }
    };
    utteranceRef.current = utterance;
    setStatus("speaking");
    speechSynthesis.speak(utterance);
  }, [rate, text]);

  const pause = useCallback(() => {
    speechSynthesisOf()?.pause();
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    speechSynthesisOf()?.resume();
    setStatus("speaking");
  }, []);

  return {
    supported: speechSynthesisSupported(),
    status,
    rate,
    setRate,
    speak,
    pause,
    resume,
    stop,
  };
}
