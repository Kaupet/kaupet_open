import type { CategoryNode } from "@/lib/category-filters";
import { flowOwner, verticalFieldGroup } from "@/lib/verticals";

/**
 * Ordered, reorderable, togglable field-group keys a category's flow is
 * built from (see src/features/listing-creation/field-groups/). The configured
 * order remains authoritative inside the shared task boundaries, while
 * structural solo pages stay explicit. Vertikalenes egne grupper har flaggene
 * sine på registreringen (VerticalFieldGroup i src/lib/verticals.ts).
 */
export const DEFAULT_FIELD_GROUPS: string[] = [
  "photos",
  "title",
  "category-attributes",
  "condition",
  "price",
  "description-keywords",
  "delivery",
  "location",
  "review-publish",
];

export type ListingTask = "showcase" | "searchable" | "trade" | "review";

/** Shared semantic task for every core content field group. Structural groups are
 * deliberately absent because they keep their own page labels. */
const LISTING_TASK_BY_FIELD_GROUP_KEY: Partial<Record<string, ListingTask>> = {
  photos: "showcase",
  title: "showcase",
  "category-attributes": "searchable",
  "description-keywords": "searchable",
  condition: "trade",
  price: "trade",
  delivery: "trade",
  location: "trade",
  "review-publish": "review",
};

/** Oppgaven en feltgruppe hører til, også for grupper en vertikal har registrert. */
export function listingTaskFor(key: string): ListingTask | undefined {
  return LISTING_TASK_BY_FIELD_GROUP_KEY[key] ?? verticalFieldGroup(key)?.task;
}

export type CategoryFlow = {
  fieldGroups: string[];
};

export type CategoryFlowRow = {
  id: string;
  category_id: string;
  field_groups: string[];
  sort_order: number;
};

const DEFAULT_FLOW: CategoryFlow = { fieldGroups: DEFAULT_FIELD_GROUPS };

export function normalizeFieldGroupKeys(keys: string[]): string[] {
  // Deduplicated (first occurrence wins): a field group asked twice in the
  // same flow means the user is asked the same question twice, which is a
  // configuration mistake in every case — cheaper to make impossible here
  // than to guard in each group.
  const normalized = [...new Set(keys)];
  // En vertikal som eier flyten, ordner den selv (VerticalFlow.normalize).
  return flowOwner(normalized)?.normalize(normalized) ?? normalized;
}

/**
 * Returns the effective flow (field groups) for a category: the
 * flow declared on the category itself, or the nearest ancestor's flow, or
 * the default flow if no category in the chain has one. Unlike
 * category_filters (which merges parent + child by key), a child flow row
 * overrides its parent's field_groups wholesale — a category either
 * opts into a fully custom flow or inherits one completely.
 *
 * `category-select` is always prepended and is never part of the stored
 * `field_groups` — it's a structural, always-first step (pick a category
 * before anything else), not admin-configurable content.
 */
export function effectiveFlowForCategory(
  categoryId: string | null,
  allFlows: CategoryFlowRow[],
  categoriesById: Map<string, CategoryNode>,
  entry: LandingEntry | null = null,
): CategoryFlow {
  const prepend =
    entry === "title"
      ? applyLandingEntry
      : entry === "photos"
        ? applyPhotosEntry
        : prependCategorySelect;
  if (!categoryId) return prepend(DEFAULT_FLOW);
  const flowsByCategoryId = new Map(allFlows.map((f) => [f.category_id, f]));
  let cur: CategoryNode | undefined = categoriesById.get(categoryId);
  while (cur) {
    const row = flowsByCategoryId.get(cur.id);
    if (row) {
      return prepend({ fieldGroups: normalizeFieldGroupKeys(row.field_groups) });
    }
    cur = cur.parent_id ? categoriesById.get(cur.parent_id) : undefined;
  }
  return prepend(DEFAULT_FLOW);
}

/** How the wizard was entered from the intent landing screen: with a title
 * already typed, or photos-first with the title still to come. */
export type LandingEntry = "title" | "photos";

function prependCategorySelect(flow: CategoryFlow): CategoryFlow {
  return { ...flow, fieldGroups: ["category-select", ...flow.fieldGroups] };
}

/**
 * Entry from the intent+title landing screen: the title is already answered
 * and photos are always step 1, whichever category flow ends up applying.
 * Both are therefore removed from wherever the stored flow put them —
 * `photos` re-added at the front, `title` dropped entirely (it stays
 * editable from the composer header instead).
 *
 * Hoisting `photos` rather than leaving it in place is what keeps the wizard
 * stable when the flow is swapped mid-session: the user picks a category on
 * step 2 (category-confirm), which replaces the whole page array while the
 * step index stays put. With `photos` first in *every* flow, step 1 is the
 * same page before and after the swap, so the images step can never reappear
 * later in a vertical's flow that happens to list it further down.
 */
function applyLandingEntry(flow: CategoryFlow): CategoryFlow {
  const rest = flow.fieldGroups.filter((key) => key !== "photos" && key !== "title");
  return { ...flow, fieldGroups: ["photos", ...rest] };
}

/**
 * Photos-first entry from the landing screen: like `applyLandingEntry`, but
 * nothing is answered yet, so `title` stays — right after `photos`, on the
 * same showcase page, where the photo suggestion's "Bruk" can fill it and
 * the title-based category suggestion kicks in before category-confirm.
 * Flows a vertical owns have no `title` group (see normalizeFieldGroupKeys),
 * so none is added back for them.
 */
function applyPhotosEntry(flow: CategoryFlow): CategoryFlow {
  const rest = flow.fieldGroups.filter((key) => key !== "photos" && key !== "title");
  const title = flow.fieldGroups.includes("title") ? ["title"] : [];
  return { ...flow, fieldGroups: ["photos", ...title, ...rest] };
}

/**
 * Injects the field groups that can't be stored in a category's
 * `field_groups` because they depend on live wizard state, or that belong to
 * a vertical's flow without an admin-configurable position of their own:
 *
 * - `category-confirm` right after `photos`, while the landing-screen entry
 *   still has an unconfirmed AI category suggestion;
 * - the owning vertical's `runtimeGroups` (VerticalFlow) right before
 *   `review-publish`. Runtime-injected rather than stored, so they need no DB
 *   migration and never show up as admin-togglable checkboxes
 *   (`resolveWizardPages` always pulls `location`/`review-publish` onto the
 *   true final page regardless of array position, so inserting right before
 *   `review-publish` here is sufficient).
 *
 * Pure so the resulting step order is testable without mounting the wizard.
 */
export function withRuntimeFieldGroups(
  keys: string[],
  options: { showCategoryConfirm: boolean },
): string[] {
  let next = keys;
  if (options.showCategoryConfirm) {
    const photosIdx = next.indexOf("photos");
    const insertAt = photosIdx === -1 ? 0 : photosIdx + 1;
    next = [...next.slice(0, insertAt), "category-confirm", ...next.slice(insertAt)];
  }
  const owner = flowOwner(next);
  if (!owner) return next;
  const reviewIdx = next.indexOf("review-publish");
  const insertAt = reviewIdx === -1 ? next.length : reviewIdx;
  return [...next.slice(0, insertAt), ...owner.runtimeGroups, ...next.slice(insertAt)];
}

/** Field-group keys that always get their own solo page, wherever they land
 * in the ordered array — `category-select` is always first (see
 * prependCategorySelect). Vertikalens grupper med `solo` behandles likt. */
const SOLO_FIELD_GROUP_KEYS: Record<string, true> = {
  "category-select": true,
  "category-confirm": true,
};

function isSolo(key: string) {
  return !!SOLO_FIELD_GROUP_KEYS[key] || !!verticalFieldGroup(key)?.solo;
}

/**
 * Ordinære flyter: samme fire oppgavegrenser på web og native — vis tingen,
 * gjør den søkbar, avklar handelen, se over og publiser. Kategorivalg og
 * -bekreftelse forblir strukturelle solo-sider.
 *
 * Gruppe­rekkefølgen inne på hver oppgaveside følger fortsatt den
 * konfigurerte flyten; bare de fire grensene ligger fast.
 */
function resolveTaskPages(fieldGroupKeys: string[]): string[][] {
  const taskPages: Record<ListingTask, string[]> = {
    showcase: [],
    searchable: [],
    trade: [],
    review: [],
  };
  for (const key of fieldGroupKeys) {
    const task = listingTaskFor(key);
    if (task) taskPages[task].push(key);
    else if (!isSolo(key)) taskPages.searchable.push(key);
  }
  const pages = [
    ...(fieldGroupKeys.includes("category-select") ? [["category-select"]] : []),
    taskPages.showcase,
    ...(fieldGroupKeys.includes("category-confirm") ? [["category-confirm"]] : []),
    taskPages.searchable,
    taskPages.trade,
    taskPages.review,
  ];
  return pages.filter((groups) => groups.length > 0);
}

const CHUNK_SIZE = 4;

/**
 * Flyter en vertikal eier (VerticalFlow) har egne, plattformspesifikke
 * sider: én gruppe per side på native, og ellers grupper bunta i sider på
 * inntil `CHUNK_SIZE`. `delivery`/`location`/`review-publish` trekkes alltid
 * ut på den siste siden, uansett hvor i arrayet de står.
 *
 * En gruppe med `forceBreakBefore` starter en ny side uten å bli solo —
 * nøkler etter den brytes fortsatt sammen opp til chunk-grensen.
 */
function resolveChunkedPages(fieldGroupKeys: string[], options: { native: boolean }): string[][] {
  if (options.native) return fieldGroupKeys.map((key) => [key]);

  const endKeys = ["delivery", "location", "review-publish"];
  const pages: string[][] = [];
  let buffer: string[] = [];
  let bufferSize = 0;
  const flush = () => {
    if (buffer.length > 0) {
      pages.push(buffer);
      buffer = [];
      bufferSize = 0;
    }
  };

  for (const key of fieldGroupKeys.filter((k) => !endKeys.includes(k))) {
    if (isSolo(key)) {
      flush();
      pages.push([key]);
      continue;
    }
    if (verticalFieldGroup(key)?.forceBreakBefore) flush();
    buffer.push(key);
    // photos + title deler én visuell rad og teller derfor som én gruppe.
    if (!(key === "title" && buffer.at(-2) === "photos")) bufferSize += 1;
    if (bufferSize >= CHUNK_SIZE) flush();
  }
  flush();

  const lastPage = endKeys.filter((key) => fieldGroupKeys.includes(key));
  if (lastPage.length > 0) pages.push(lastPage);

  return pages;
}

/** Deler en ordnet liste med aktive feltgruppenøkler i wizard-sider. */
export function resolveWizardPages(
  fieldGroupKeys: string[],
  options: { native: boolean },
): string[][] {
  return flowOwner(fieldGroupKeys)
    ? resolveChunkedPages(fieldGroupKeys, options)
    : resolveTaskPages(fieldGroupKeys);
}
