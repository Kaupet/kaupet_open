// kaupet_open: bunnteksten har bare krediteringen lisensen krever
// (AGPL-3.0 § 7(b), se NOTICE). Ingen andre lenker eller tekster er med.
export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground">
        Bygd på{" "}
        <a
          href="https://github.com/Kaupet/kaupet_open"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          kaupet_open
        </a>
      </p>
    </footer>
  );
}
