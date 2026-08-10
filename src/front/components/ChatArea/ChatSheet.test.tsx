import { describe, it, expect, vi } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatSheet } from "./ChatSheet";

const CONVERSATION = "ここに会話が入ります";

describe("ChatSheet", () => {
  it("stays out of the way until the reader asks for it", () => {
    render(
      <ChatSheet state="closed" onChange={() => {}}>
        <p>{CONVERSATION}</p>
      </ChatSheet>,
    );

    expect(screen.queryByRole("region", { name: "チャット" })).toBeNull();
    expect(screen.queryByText(CONVERSATION)).toBeNull();
  });

  it("shows the conversation once it is up", () => {
    render(
      <ChatSheet state="half" onChange={() => {}}>
        <p>{CONVERSATION}</p>
      </ChatSheet>,
    );

    expect(screen.getByRole("region", { name: "チャット" })).toBeInTheDocument();
    expect(screen.getByText(CONVERSATION)).toBeInTheDocument();
  });

  it("offers to grow while it is only half up", async () => {
    const onChange = vi.fn();
    render(
      <ChatSheet state="half" onChange={onChange}>
        <p>{CONVERSATION}</p>
      </ChatSheet>,
    );

    await userEvent.click(screen.getByRole("button", { name: "チャットを広げる" }));

    expect(onChange.mock.calls).toStrictEqual([["full"]]);
  });

  it("offers to shrink back once it is all the way up", async () => {
    // The same handle both ways: a sheet that could only grow would leave the
    // page it covers unreachable except by closing the conversation.
    const onChange = vi.fn();
    render(
      <ChatSheet state="full" onChange={onChange}>
        <p>{CONVERSATION}</p>
      </ChatSheet>,
    );

    await userEvent.click(screen.getByRole("button", { name: "チャットを縮める" }));

    expect(onChange.mock.calls).toStrictEqual([["half"]]);
  });

  it("puts itself away on the close button", async () => {
    const onChange = vi.fn();
    render(
      <ChatSheet state="full" onChange={onChange}>
        <p>{CONVERSATION}</p>
      </ChatSheet>,
    );

    await userEvent.click(screen.getByRole("button", { name: "チャットを閉じる" }));

    expect(onChange.mock.calls).toStrictEqual([["closed"]]);
  });
});
