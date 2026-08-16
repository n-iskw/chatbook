// oxlint-disable-next-line no-restricted-imports -- ブリッジの接続確認、状態ポーリング、ページ変更時の停止購読に必要
import { useCallback, useEffect, useState } from "react";

export type MacSpeechStatus = "idle" | "speaking" | "paused";
type SelectionCommand = "speak-selection" | "stop-selection";

const DEFAULT_BRIDGE_URL = "http://127.0.0.1:8789";

function bridgeUrl(): string {
  if (typeof window === "undefined") return DEFAULT_BRIDGE_URL;
  return window.localStorage.getItem("chatbook.macSpeechBridgeUrl") || DEFAULT_BRIDGE_URL;
}

async function requestBridge(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  return fetch(`${bridgeUrl()}${path}`, {
    ...init,
    headers,
  });
}

export function useMacSpeech(text: string) {
  const [available, setAvailable] = useState(false);
  const [status, setStatus] = useState<MacSpeechStatus>("idle");
  const [rate, setRate] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void requestBridge("/healthz")
      .then((response) => {
        if (!cancelled) setAvailable(response.ok);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const control = useCallback(async (command: "pause" | "resume" | "stop") => {
    try {
      const response = await requestBridge("/v1/speech", {
        method: "POST",
        body: JSON.stringify({ command }),
      });
      if (!response.ok) throw new Error("Mac音声ブリッジに接続できません");
      return true;
    } catch (cause) {
      setAvailable(false);
      setStatus("idle");
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    }
  }, []);

  const speak = useCallback(async () => {
    if (!available || !text.trim()) return false;
    try {
      const response = await requestBridge("/v1/speech", {
        method: "POST",
        body: JSON.stringify({ command: "speak", text, language: "ja-JP", rate }),
      });
      if (!response.ok) throw new Error("Mac音声ブリッジに接続できません");
      setError(null);
      setStatus("speaking");
      return true;
    } catch (cause) {
      setAvailable(false);
      setStatus("idle");
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    }
  }, [available, rate, text]);

  const pause = useCallback(async () => {
    if (await control("pause")) setStatus("paused");
  }, [control]);

  const resume = useCallback(async () => {
    if (await control("resume")) setStatus("speaking");
  }, [control]);

  const stop = useCallback(async () => {
    await control("stop");
    setStatus("idle");
  }, [control]);

  // macOS Speak Selection is a system accessibility action rather than an
  // AVSpeechSynthesizer session. It has no completion/pause event we can
  // observe here, so the page control tracks its active state separately.
  const selectionControl = useCallback(async (command: SelectionCommand) => {
    try {
      const response = await requestBridge("/v1/speech", {
        method: "POST",
        body: JSON.stringify({ command }),
      });
      if (!response.ok) throw new Error("Mac音声ブリッジに接続できません");

      // The bridge accepts the request before the Swift helper reports an
      // accessibility permission failure. Give that event a moment to reach
      // the status endpoint so the UI can show the real reason.
      await new Promise((resolve) => window.setTimeout(resolve, 100));
      const statusResponse = await requestBridge("/v1/speech/status");
      if (statusResponse.ok) {
        const next = (await statusResponse.json()) as { error?: string | null };
        if (next.error) throw new Error(next.error);
      }
      setError(null);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    }
  }, []);

  const speakSelection = useCallback(() => selectionControl("speak-selection"), [selectionControl]);

  const stopSelection = useCallback(() => selectionControl("stop-selection"), [selectionControl]);

  useEffect(() => {
    if (status === "idle") return;
    const timer = window.setInterval(() => {
      void requestBridge("/v1/speech/status")
        .then(async (response) => {
          if (!response.ok) throw new Error("Mac音声ブリッジに接続できません");
          const next = (await response.json()) as {
            status?: MacSpeechStatus;
            error?: string | null;
          };
          setStatus(next.status ?? "idle");
          setError(next.error ?? null);
        })
        .catch(() => {
          setAvailable(false);
          setStatus("idle");
        });
    }, 300);
    return () => window.clearInterval(timer);
  }, [status]);

  // Changing pages or leaving the reader must not leave the old page speaking.
  useEffect(() => () => void control("stop"), [control, text]);

  return {
    available,
    status,
    rate,
    setRate,
    error,
    speak,
    pause,
    resume,
    stop,
    speakSelection,
    stopSelection,
  };
}
