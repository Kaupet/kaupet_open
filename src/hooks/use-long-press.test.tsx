// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LONG_PRESS_MS, useLongPress } from "./use-long-press";

function Target({ onLongPress }: { onLongPress: () => void }) {
  return <div data-testid="t" {...useLongPress(onLongPress)} />;
}

const touch = (x = 0, y = 0) => ({ pointerType: "touch", clientX: x, clientY: y });

describe("useLongPress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function setup() {
    const onLongPress = vi.fn();
    const { getByTestId } = render(<Target onLongPress={onLongPress} />);
    return { onLongPress, el: getByTestId("t") };
  }

  it("utløses etter holdetiden, ikke før", () => {
    const { onLongPress, el } = setup();
    fireEvent.pointerDown(el, touch());
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(onLongPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLongPress).toHaveBeenCalledOnce();
  });

  it("avbrytes når fingeren slippes, flyttes over 10 px eller rullingen tar over", () => {
    const { onLongPress, el } = setup();
    fireEvent.pointerDown(el, touch());
    fireEvent.pointerUp(el);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    fireEvent.pointerDown(el, touch());
    fireEvent.pointerMove(el, touch(8, 8));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    fireEvent.pointerDown(el, touch());
    fireEvent.pointerCancel(el);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("tåler små bevegelser og ignorerer mus", () => {
    const { onLongPress, el } = setup();
    fireEvent.pointerDown(el, { pointerType: "mouse" });
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onLongPress).not.toHaveBeenCalled();
    fireEvent.pointerDown(el, touch());
    fireEvent.pointerMove(el, touch(5, 5));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onLongPress).toHaveBeenCalledOnce();
  });
});
