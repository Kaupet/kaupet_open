import { lazy, Suspense, useEffect, useEffectEvent, useRef, useState } from "react";
import { CatchBoundary } from "@tanstack/react-router";
import { ChevronDown, Sparkles } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ImageUploader } from "@/components/image-uploader";
import { NativeSheet } from "@/components/ui/native-sheet";

import type { WizardSharedProps } from "../types";
import { FieldValid } from "../field-valid";
import { RequiredMark } from "../required-mark";
import { SITE_SHORT_NAME } from "@/lib/site";

/**
 * Non-vehicle title input. Vehicle categories never reach this component —
 * `withRuntimeFieldGroups` (category-flows.ts) strips "title" from a
 * vehicle flow's field groups entirely (their title moved to the
 * beskrivelse step, see `VehicleTitleFields` usage in
 * description-keywords/index.tsx), so it no longer needs its own
 * vehicle-vs-generic branch.
 */
export function TitleGroup(
  props: Pick<
    WizardSharedProps,
    "register" | "errors" | "touchedFields" | "title" | "titleExample" | "titleCollapsible"
  >,
) {
  const [opened, setOpened] = useState(false);
  // Sammenslått bak "Jeg vil fylle ut tittel selv" så lenge KI-knappen på
  // bildesiden er hovedvalget — men aldri når feltet har innhold eller en
  // feil som må synes.
  if (props.titleCollapsible && !opened && !props.title && !props.errors.title) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="native-touch-target h-auto w-full justify-between px-0 hover:bg-transparent"
        aria-expanded={false}
        onClick={() => setOpened(true)}
      >
        Jeg vil fylle ut tittel selv
        <ChevronDown className="size-4 shrink-0" aria-hidden />
      </Button>
    );
  }
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="title">
          Tittel
          <RequiredMark />
        </Label>
        <div className="flex items-center gap-1.5">
          <FieldValid show={!!props.touchedFields.title && !props.errors.title} />
          <span className="text-xs text-muted-foreground">{(props.title ?? "").length} / 120</span>
        </div>
      </div>
      <Input
        id="title"
        data-testid="listing-title-input"
        placeholder={`F.eks. ${props.titleExample ?? "Trek Marlin 5 sykkel 2022 — sort, lite brukt"}`}
        aria-required="true"
        aria-invalid={!!props.errors.title}
        aria-describedby={props.errors.title ? "title-error" : undefined}
        // Bare når brukeren nettopp åpnet feltet selv, ikke ved vanlig lasting.
        autoFocus={opened}
        {...props.register("title")}
      />
      {props.errors.title && (
        <p id="title-error" className="text-sm text-destructive">
          {props.errors.title.message}
        </p>
      )}
    </section>
  );
}

// Stabil referanse: en ny funksjon ville rullet tilbake ved hver rendering.
function scrollToPhotoSuggestionPolicy(content: HTMLDivElement | null) {
  content?.querySelector("#bildeforslag")?.scrollIntoView();
}

// Lastes først når skuffen åpnes, så teksten ikke tynger annonseveiviseren.
const PhotoSuggestionPolicy = lazy(async () => {
  const { PersonvernContent } = await import("@/components/legal/personvern-content");
  return {
    default: () => (
      <div ref={scrollToPhotoSuggestionPolicy} className="px-1 pb-6">
        <PersonvernContent />
      </div>
    ),
  };
});

// En mislykket lasting (for eksempel gammel chunk etter en deploy) skal ikke ta
// med seg skjemaet brukeren holder på med. React husker feilen, så «prøv igjen» ville ikke hjelpe.
function PolicyLoadError() {
  return (
    <p role="alert" className="px-1 pb-6 text-sm">
      Kunne ikke laste personvernerklæringen her.{" "}
      <a
        href="/personvern#bildeforslag"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-4"
      >
        Les den i en ny fane
      </a>
      .
    </p>
  );
}

export function PhotosGroup({
  images,
  setImages,
  uploadProgress,
  noImageConfirmPending,
  setValue,
  title,
  photoSuggestionEnabled,
  photoSuggestionDisabled,
  photoSuggestionStatus,
  analyzePhotos,
  photoTitleSuggestion,
  applyPhotoTitleSuggestion,
}: Pick<
  WizardSharedProps,
  | "images"
  | "setImages"
  | "uploadProgress"
  | "noImageConfirmPending"
  | "setValue"
  | "title"
  | "photoSuggestionEnabled"
  | "photoSuggestionDisabled"
  | "photoSuggestionStatus"
  | "analyzePhotos"
  | "photoTitleSuggestion"
  | "applyPhotoTitleSuggestion"
>) {
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const scrollFrame = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    },
    [],
  );

  function applyTitle(suggestion: string) {
    setValue("title", suggestion, { shouldValidate: true });
    applyPhotoTitleSuggestion(suggestion);
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    // Vent til det utfylte tittelfeltet er rendret, uten å åpne tastaturet.
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      const field = document.getElementById("title");
      if (!field) return;
      const container = field.closest<HTMLElement>("[data-composer-scroll]");
      const view = container?.getBoundingClientRect();
      const style = container && getComputedStyle(container);
      const top = (view?.top ?? 0) + (Number.parseFloat(style?.scrollPaddingTop ?? "0") || 0);
      const bottom =
        (view?.bottom ?? window.innerHeight) -
        (Number.parseFloat(style?.scrollPaddingBottom ?? "0") || 0);
      const rect = field.getBoundingClientRect();
      if (rect.top >= top && rect.bottom <= bottom) return;
      field.scrollIntoView({ block: "center", behavior: "instant" });
    });
  }
  // Brukeren ba om å få tittelen fylt ut: er feltet tomt, brukes forslaget
  // direkte. Har de skrevet noe selv, får de heller velge med "Bruk" under.
  const fillTitleFromSuggestion = useEffectEvent((suggestion: typeof photoTitleSuggestion) => {
    if (suggestion && !title.trim()) {
      applyTitle(suggestion);
    }
  });
  useEffect(() => {
    fillTitleFromSuggestion(photoTitleSuggestion);
  }, [photoTitleSuggestion]);

  return (
    <section className="space-y-2">
      <Label>Legg til bilder</Label>
      <p className="text-sm text-muted-foreground">
        Gode bilder gjør det enklere å vurdere annonsen.
      </p>
      <ImageUploader images={images} onChange={setImages} uploadProgress={uploadProgress} />
      {noImageConfirmPending && images.length === 0 && (
        <p role="status" className="text-sm text-foreground">
          Annonser med bilder får flere henvendelser. Du kan legge til bilder senere.
        </p>
      )}
      {photoSuggestionEnabled && (
        <>
          <div className="space-y-1.5 pt-2">
            <Button
              type="button"
              variant="outline"
              data-testid="photo-suggestion-button"
              className="native-touch-target h-12 w-full gap-2 rounded-xl border-brand/40 text-brand-text hover:text-brand-text"
              onClick={analyzePhotos}
              disabled={
                photoSuggestionDisabled ||
                images.length === 0 ||
                photoSuggestionStatus === "analyzing" ||
                photoSuggestionStatus === "verifying"
              }
              aria-describedby="photo-suggestion-help"
            >
              <Sparkles className="size-4 shrink-0" aria-hidden />
              Fyll ut tittel og kategori for meg
            </Button>
            <p id="photo-suggestion-help" className="text-xs text-muted-foreground">
              {images.length === 0 ? "Legg til minst ett bilde først. " : ""}
              Denne funksjonen benytter KI for å analysere bildene. Les mer om hvordan bildene
              behandles i{" "}
              <button
                type="button"
                onClick={() => setPrivacyOpen(true)}
                className="underline underline-offset-4 hover:text-foreground"
              >
                personvernerklæringen
              </button>
              .
            </p>
          </div>
          <NativeSheet
            open={privacyOpen}
            onOpenChange={setPrivacyOpen}
            title={<span className="font-display text-2xl font-medium">Personvernerklæring</span>}
            titleVisible
            headerClassName="mb-4 px-1 text-left"
            expandable
            // Fullhøyde fra start: ellers nullstiller første utvidelse rullingen til avsnittet.
            initialSnapPoint={1}
            className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
          >
            <CatchBoundary getResetKey={() => "policy"} errorComponent={PolicyLoadError}>
              <Suspense
                fallback={
                  <p role="status" className="px-1 pb-6 text-sm text-muted-foreground">
                    Laster personvernerklæringen …
                  </p>
                }
              >
                <PhotoSuggestionPolicy />
              </Suspense>
            </CatchBoundary>
          </NativeSheet>
          {photoSuggestionStatus === "analyzing" && (
            <p role="status" className="text-sm text-muted-foreground">
              Analyserer bildene …
            </p>
          )}
          {(photoSuggestionStatus === "verifying" ||
            photoSuggestionStatus === "verification-required") && (
            <p role="status" className="text-sm text-muted-foreground">
              Bekreft Cloudflare-sjekken for å analysere bildene.
            </p>
          )}
          {photoSuggestionStatus === "unavailable" && (
            <p className="text-sm text-muted-foreground">
              Vi fikk dessverre ikke til å analysere bildene nå. Du må fylle ut selv.
            </p>
          )}
          {photoTitleSuggestion && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-brand/30 bg-brand/5 px-3 py-2 text-sm">
              <span className="inline-flex items-center gap-1 font-medium text-brand-text">
                <Sparkles className="size-4 shrink-0" aria-hidden />
                {SITE_SHORT_NAME} foreslår tittel: {photoTitleSuggestion}
              </span>
              <Button
                type="button"
                size="sm"
                className="native-touch-target"
                onClick={() => {
                  applyTitle(photoTitleSuggestion);
                }}
              >
                Bruk
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
