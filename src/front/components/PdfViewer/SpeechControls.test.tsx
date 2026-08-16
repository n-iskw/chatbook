import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SpeechControls } from "./SpeechControls";

class FakeSpeechSynthesisUtterance {
  readonly text: string;
  lang = "";
  rate = 1;
  onstart: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onresume: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

const speech = {
  speak: vi.fn((utterance: FakeSpeechSynthesisUtterance) => utterance.onstart?.()),
  pause: vi.fn(),
  resume: vi.fn(),
  cancel: vi.fn(),
};

describe("SpeechControls", () => {
  beforeEach(() => {
    vi.stubGlobal("speechSynthesis", speech);
    vi.stubGlobal("SpeechSynthesisUtterance", FakeSpeechSynthesisUtterance);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("reads the selected text and offers pause, resume, and stop", async () => {
    const user = userEvent.setup();
    render(<SpeechControls text="エッジはサーバーレス実行基盤です。" />);

    await user.click(screen.getByRole("button", { name: "読み上げ" }));

    expect(speech.speak).toHaveBeenCalledOnce();
    expect(speech.speak.mock.calls[0][0]).toMatchObject({
      text: "エッジはサーバーレス実行基盤です。",
      lang: "ja-JP",
      rate: 1,
    });
    expect(screen.getByRole("button", { name: "一時停止" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "一時停止" }));
    expect(speech.pause).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "再開" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "再開" }));
    expect(speech.resume).toHaveBeenCalledOnce();

    speech.cancel.mockClear();
    await user.click(screen.getByRole("button", { name: "読み上げを停止" }));
    expect(speech.cancel).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "読み上げ" })).toBeInTheDocument();
  });

  it("uses the selected reading speed when playback starts", async () => {
    const user = userEvent.setup();
    render(<SpeechControls text="速度を変えて読み上げます。" />);

    await user.selectOptions(screen.getByRole("combobox", { name: "読み上げ速度" }), "1.5");
    await user.click(screen.getByRole("button", { name: "読み上げ" }));

    expect(speech.speak.mock.calls[0][0]).toMatchObject({ rate: 1.5 });
  });
});
