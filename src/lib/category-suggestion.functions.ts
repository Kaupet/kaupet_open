// kaupet_open-stub. Kategoriforslag fra tittel og bilder finnes ikke i
// kaupet_open; selgeren velger kategori selv.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type CategorySuggestion = {
  category_id: string;
  slug: string;
  name_nb: string;
  parent_id: string | null;
  parent_name_nb: string | null;
  confidence: number;
};
type CategorySuggestionResult = { suggestions: CategorySuggestion[] };

export const suggestCategoryForTitle = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ title: z.string() }).parse(input))
  .handler(async (): Promise<{ suggestions: [] | [CategorySuggestion] }> => ({ suggestions: [] }));

export const suggestCategoryForTitleWithAi = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ title: z.string(), turnstileToken: z.string() }).parse(input),
  )
  .handler(async (): Promise<CategorySuggestionResult> => ({ suggestions: [] }));

export const suggestListingFromPhotos = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        operation: z.enum(["attributes", "identify"]),
        turnstileToken: z.string(),
        images: z.array(
          z.object({
            mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
            dataUrl: z.string(),
          }),
        ),
        title: z.string().optional(),
        categorySlug: z.string().optional(),
      })
      .parse(input),
  )
  .handler(
    async (): Promise<
      | { status: "unavailable"; source: "photo-ai"; categories: never[]; attributes: never[] }
      | {
          title?: string;
          status: "pending";
          source: "photo-ai";
          categories: Omit<CategorySuggestion, "confidence">[];
          attributes?: undefined;
        }
      | {
          status: "pending";
          source: "photo-ai";
          attributes: { key: string; value: string | number | boolean }[];
        }
    > => ({ status: "unavailable", source: "photo-ai", categories: [], attributes: [] }),
  );

export const getPhotoSuggestionAvailability = createServerFn({ method: "GET" }).handler(
  async () => ({ enabled: false }),
);

export async function prefetchCategorySuggestion(
  _title: string,
): Promise<CategorySuggestionResult> {
  return { suggestions: [] };
}
