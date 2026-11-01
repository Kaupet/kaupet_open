import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

/**
 * Fanerad for de offentlige profilsidene (bedrift og privat). Hver fane er en
 * lenke til gjeldende side med `?tab=`, så fanene har egne URL-er.
 */
export function ProfileTabs<T extends string>({
  label,
  tabs,
  current,
  accentClassName = "border-primary",
}: {
  label: string;
  tabs: { key: T; label: string; count?: number }[];
  current: T;
  /** Kantfargen under aktiv fane, f.eks. bedriftens merkevarefarge. */
  accentClassName?: string;
}) {
  return (
    <nav aria-label={label} className="border-b border-border bg-card">
      <ul className="mx-auto flex max-w-6xl gap-6 overflow-x-auto px-4 sm:gap-8">
        {tabs.map((tab) => (
          <li key={tab.key} className="shrink-0">
            <Link
              to="."
              // `to="."` er gjeldende rute; T er dens fanetype, som TanStack ikke
              // kan utlede for en gjenbrukbar komponent.
              search={{ tab: tab.key } as never}
              replace
              resetScroll={false}
              aria-current={current === tab.key ? "page" : undefined}
              className={cn(
                "-mb-px flex min-h-12 items-center gap-1.5 border-b-[3px] text-sm sm:text-base",
                current === tab.key
                  ? cn(accentClassName, "font-semibold text-foreground")
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="font-normal text-muted-foreground">{tab.count}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
