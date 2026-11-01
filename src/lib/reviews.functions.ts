// kaupet_open-stub. Anmeldelser finnes ikke i kaupet_open.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { ClientError } from "@/lib/to-client-error";

export type ReviewRow = {
  id: string;
  listing_id: string;
  reviewer_id: string;
  reviewee_id: string;
  role: "buyer" | "seller";
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer: { id: string; display_name: string | null; avatar_url: string | null } | null;
  listing: { id: string; kaupet_code: string; title: string } | null;
};

export const createReview = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({ listingId: z.string(), rating: z.number(), comment: z.string().optional() })
      .parse(input),
  )
  .handler(async (): Promise<{ ok: true }> => {
    throw new ClientError("Anmeldelser er ikke med i denne versjonen.", 404);
  });

export const getMyReviewForListing = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ listingId: z.string() }).parse(input))
  .handler(async (): Promise<ReviewRow | null> => null);

export type ReviewPage = {
  reviews: {
    id: string;
    rating: number;
    comment: string | null;
    created_at: string;
    role: "buyer" | "seller";
    reviewer_name: string | null;
    listing: { kaupet_code: string; title: string } | null;
  }[];
  avg_rating: number;
  review_count: number;
  rating_counts: number[];
};

const EMPTY_PAGE: ReviewPage = {
  reviews: [],
  avg_rating: 0,
  review_count: 0,
  rating_counts: [0, 0, 0, 0, 0],
};

export const getUserReviews = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ userId: z.string(), offset: z.number().optional() }).parse(input),
  )
  .handler(async (): Promise<ReviewPage> => EMPTY_PAGE);

export const getOrganizationReviews = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ organizationId: z.string(), offset: z.number().optional() }).parse(input),
  )
  .handler(async (): Promise<ReviewPage> => EMPTY_PAGE);
