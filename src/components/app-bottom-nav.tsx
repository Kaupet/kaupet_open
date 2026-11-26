import { Link } from "@tanstack/react-router";
import { House, MessageCircle, Search, UserRound } from "lucide-react";

const tabs = [
  { to: "/", label: "Hjem", icon: House },
  { to: "/annonser", label: "Søk", icon: Search },
  { to: "/meldinger", label: "Meldinger", icon: MessageCircle },
  { to: "/meg", label: "Meg", icon: UserRound },
] as const;

export function AppBottomNav({ hidden }: { hidden?: boolean }) {
  return (
    <nav
      aria-label="Bunnavigasjon"
      className="app-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background pb-[var(--safe-bottom)]"
      hidden={hidden}
    >
      <ul className="px-safe mx-auto grid max-w-xl grid-cols-4">
        {tabs.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              activeOptions={{ exact: to === "/", includeSearch: false }}
              activeProps={{ className: "bg-accent font-semibold text-accent-foreground" }}
              className="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1 text-xs text-muted-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
