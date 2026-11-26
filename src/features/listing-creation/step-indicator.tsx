import { Check, ChevronDown } from "lucide-react";

import { type WizardPage } from "@/features/listing-creation/use-listing-steps";
import { pageLabel } from "@/features/listing-creation/field-groups/registry";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export function ComposerStepIndicator({
  current,
  total,
  label,
  stepLabels,
  onSelectStep,
}: {
  current: number;
  /** Utelates "av Y" når stegantallet ikke er kjent ennå (kategoriavhengig
   * flyt ikke bestemt) — se UI-guiden. */
  total?: number;
  label: string;
  /** Etikett per steg, indeks 0 = steg 1. Sammen med `onSelectStep` gjør den telleren til en meny. */
  stepLabels?: string[];
  onSelectStep?: (step: number) => void;
}) {
  const percent = total && total > 0 ? Math.round((current / total) * 100) : 0;
  const counter = total ? `Steg ${current} av ${total}` : `Steg ${current}`;
  const navigable = stepLabels && onSelectStep;

  return (
    <nav aria-label="Fremdrift i skjema" className="space-y-1.5">
      <div data-step-counter className="flex items-center justify-between gap-2 text-xs">
        {navigable ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="native-hit-area z-10 -my-1 -ml-1 flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1 py-1 font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              {counter}
              <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
              {stepLabels.map((stepLabel, index) => {
                const stepNumber = index + 1;
                const isCurrent = stepNumber === current;
                return (
                  <DropdownMenuItem
                    key={`${stepNumber}-${stepLabel}`}
                    disabled={stepNumber > current}
                    aria-current={isCurrent ? "step" : undefined}
                    onSelect={() => onSelectStep(stepNumber)}
                  >
                    <Check className={isCurrent ? "size-4" : "size-4 opacity-0"} aria-hidden />
                    {stepNumber}. {stepLabel}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="shrink-0 whitespace-nowrap font-medium text-foreground">{counter}</span>
        )}
        <span className="truncate text-muted-foreground">{label}</span>
      </div>
      <Progress value={percent} aria-label={`${counter}: ${label}`} className="h-1.5 bg-muted" />
      {stepLabels && (
        <StepList
          current={current}
          stepLabels={stepLabels}
          flowKnown={!!total}
          onSelectStep={onSelectStep}
        />
      )}
    </nav>
  );
}

/**
 * Alle stegene som en liste. Skjult som standard: den vises bare i
 * landskapskolonnen i native-veiviseren (styles.css, `max-height: 30rem`),
 * der den erstatter telleren over og bruker høyden kolonnen ellers lot stå
 * tom. Ferdige steg er knapper tilbake når `onSelectStep` er satt; steg foran
 * gjeldende er det aldri, av samme grunn som i menyen over.
 */
function StepList({
  current,
  stepLabels,
  flowKnown,
  onSelectStep,
}: {
  current: number;
  stepLabels: string[];
  flowKnown: boolean;
  onSelectStep?: (step: number) => void;
}) {
  const row = "flex min-h-12 w-full items-center gap-2.5 rounded-xl px-2 text-left text-sm";
  // Før kategorien er valgt er stegene etter gjeldende bare en gjetning, og
  // UI-guiden sier at totalen ikke skal vises før flyten er kjent.
  const shownLabels = flowKnown ? stepLabels : stepLabels.slice(0, current);
  return (
    <ol data-step-list className="hidden">
      {shownLabels.map((stepLabel, index) => {
        const stepNumber = index + 1;
        const state = stepNumber < current ? "done" : stepNumber === current ? "current" : "todo";
        const content = (
          <>
            <span
              aria-hidden
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border text-[0.6875rem] font-semibold tabular-nums",
                state === "done" && "border-transparent bg-primary/10 text-primary",
                state === "current" && "border-primary bg-primary text-primary-foreground",
                state === "todo" && "border-border text-muted-foreground",
              )}
            >
              {state === "done" ? <Check className="size-3.5" /> : stepNumber}
            </span>
            <span className="min-w-0 truncate">{stepLabel}</span>
            {state === "done" && <span className="sr-only">, fullført</span>}
          </>
        );
        return (
          <li
            key={`${stepNumber}-${stepLabel}`}
            aria-current={state === "current" ? "step" : undefined}
          >
            {state === "done" && onSelectStep ? (
              <button
                type="button"
                onClick={() => onSelectStep(stepNumber)}
                className={cn(
                  row,
                  "text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                {content}
              </button>
            ) : (
              <div
                className={cn(
                  row,
                  state === "current" && "bg-primary/10 font-semibold text-foreground",
                  state === "done" && "text-foreground",
                  state === "todo" && "text-muted-foreground",
                )}
              >
                {content}
              </div>
            )}
          </li>
        );
      })}
      {!flowKnown && (
        <li className={cn(row, "text-muted-foreground")}>
          <span aria-hidden className="grid size-6 shrink-0 place-items-center">
            …
          </span>
          Flere steg etter kategorien
        </li>
      )}
    </ol>
  );
}

/**
 * Fast fremdriftslinje + "Steg X av Y" i stedet for én boks per steg — med
 * så mange steg som kjøretøyflyten nå har (se UX-audit), gikk
 * boks-per-steg-varianten over tilgjengelig sidebredde og virket enda
 * verre på små skjermer. Viser alltid gjeldende stegs label ved siden av
 * telleren, så brukeren fortsatt vet hvor i flyten de er uten å måtte lese
 * en rekke med bokser. Telleren er en meny tilbake til tidligere steg —
 * den erstatter navigasjonen "Se over"-seksjonen tidligere ga. Kun bakover:
 * steg foran gjeldende er deaktivert, så fremovervalideringen i
 * attemptNextPage ikke kan omgås.
 */
export function StepIndicator({
  step,
  pages,
  flowKnown = true,
  onSelectStep,
}: {
  step: number;
  pages: WizardPage[];
  /** Før kategorien er bekreftet er ikke det endelige stegantallet kjent —
   * vis fremdriftslinje + etikett uten "av Y" i stedet for et tall som
   * kan endre seg når kategorien velges. */
  flowKnown?: boolean;
  onSelectStep?: (step: number) => void;
}) {
  const displaySteps = pages.map((page, index) => ({
    label: pageLabel(page.groups),
    startIndex: index + 1,
    endIndex: index + 1,
  }));
  const total = displaySteps.length;
  const currentIndex = displaySteps.findIndex((ds) => step >= ds.startIndex && step <= ds.endIndex);
  const current = currentIndex === -1 ? displaySteps[total - 1] : displaySteps[currentIndex];
  const currentStepNumber = currentIndex === -1 ? total : currentIndex + 1;
  return (
    <ComposerStepIndicator
      current={currentStepNumber}
      total={flowKnown ? total : undefined}
      label={current?.label ?? ""}
      stepLabels={displaySteps.map((ds) => ds.label)}
      onSelectStep={onSelectStep}
    />
  );
}
