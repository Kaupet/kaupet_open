import type { QueryClient } from "@tanstack/react-query";

/**
 * The app-wide reference caches that admin mutations have to invalidate on
 * top of their own `["admin", …]` keys.
 *
 * Admin reads categories/filters/flows through its own query keys with its
 * own column subsets, so invalidating those alone leaves the shared caches
 * that the rest of the app reads (`useCategories`, `useAllCategoryFilters`,
 * `useAllCategoryFlows`) holding the pre-mutation rows until they go stale
 * on their own — a category renamed, hidden, re-coloured or reordered in
 * admin stayed invisible on the landing page, in search, in the listing
 * wizard and in breadcrumbs. Collected here rather than repeated at each
 * call site so a new admin mutation has one obvious thing to call.
 */
export function invalidateSharedCategoryQueries(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["categories"] });
  qc.invalidateQueries({ queryKey: ["category-filters"] });
  qc.invalidateQueries({ queryKey: ["category-flows"] });
}
