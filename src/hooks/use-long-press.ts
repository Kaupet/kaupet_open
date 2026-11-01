import { useEffect, useRef, type PointerEvent } from "react";

export const LONG_PRESS_MS = 400;
const MOVE_TOLERANCE_PX = 10;

/** Trykk og hold for berøring og penn. Avbrytes når fingeren slippes før
 * tiden, flyttes mer enn 10 px, eller nettleseren tar over for å rulle
 * (pointercancel). Mus bruker hover og høyreklikk i stedet. */
export function useLongPress(onLongPress: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => {
    clearTimeout(timer.current);
    start.current = null;
  };
  useEffect(() => cancel, []);

  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      cancel();
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        start.current = null;
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e: PointerEvent) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_TOLERANCE_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
  };
}
