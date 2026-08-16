import { useSpeechSynthesis } from "../../hooks/useSpeechSynthesis";

interface SpeechControlsProps {
  text: string;
  compact?: boolean;
}

export function SpeechControls({ text, compact = false }: SpeechControlsProps) {
  const { supported, status, rate, setRate, speak, pause, resume, stop } = useSpeechSynthesis(text);

  if (!supported) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={status === "idle" ? speak : status === "speaking" ? pause : resume}
        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
      >
        {status === "idle" ? "読み上げ" : status === "speaking" ? "一時停止" : "再開"}
      </button>
      {status !== "idle" && (
        <button
          type="button"
          aria-label="読み上げを停止"
          onClick={stop}
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          停止
        </button>
      )}
      {!compact && (
        <label className="flex items-center gap-1 text-xs text-gray-500">
          速度
          <select
            aria-label="読み上げ速度"
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
    </div>
  );
}
