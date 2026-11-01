import { Skeleton } from "@/components/ui/skeleton";

/** Loading placeholder for `/bruker/$id`, shown via the route's
 * `pendingComponent` while the loader resolves — matches the page's
 * header + listing grid shape so there's no layout shift once real content
 * lands. */
export function ProfilePageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:pt-12" aria-busy="true" aria-live="polite">
      <span className="sr-only">Laster brukerprofil…</span>
      <div className="flex items-center gap-4">
        <Skeleton className="size-20 rounded-full sm:size-24" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <div className="mt-24 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/3] w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
