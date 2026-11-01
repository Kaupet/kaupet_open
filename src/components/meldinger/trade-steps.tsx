import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import type { TradeStep } from "./trade-step";

const STEPS: { key: TradeStep; label: string }[] = [
  { key: "contact", label: "Kontakt" },
  { key: "agreed", label: "Avtalt" },
  { key: "sold", label: "Solgt" },
];

export function TradeSteps({
  step,
  orientation = "horizontal",
  className,
}: {
  step: TradeStep | null;
  orientation?: "horizontal" | "vertical";
  className?: string;
}) {
  const current = step ? STEPS.findIndex((s) => s.key === step) : -1;
  const vertical = orientation === "vertical";
  return (
    <ol
      aria-label="Status for handelen"
      className={cn(vertical ? "space-y-3" : "flex items-center gap-2", className)}
    >
      {STEPS.map((s, i) => {
        const done = i < current || (i === current && s.key === "sold");
        const active = i === current;
        return (
          <li
            key={s.key}
            aria-current={active ? "step" : undefined}
            className={cn("flex items-center gap-2", !vertical && "min-w-0 flex-1")}
          >
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold",
                done
                  ? "border-primary bg-primary text-primary-foreground"
                  : active
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground",
              )}
              aria-hidden
            >
              {done ? <Check className="size-3" /> : i + 1}
            </span>
            <span
              className={cn(
                "truncate text-xs",
                active ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
            {!vertical && i < STEPS.length - 1 && (
              <span
                className={cn("h-px flex-1", i < current ? "bg-primary" : "bg-border")}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
