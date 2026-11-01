// kaupet_open-stub. Betalt synlighet finnes ikke i kaupet_open.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type PromotionStatus = "pending" | "active" | "expired" | "failed" | "refunded" | "gifted";

export const reconcilePromotionPayment = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ promotion_id: z.string().uuid() }).parse(input))
  .handler(async () => ({
    status: "failed" as PromotionStatus,
    expires_at: null as string | null,
  }));

export const getMyActivePromotions = createServerFn({ method: "GET" }).handler(
  async () =>
    [] as {
      id: string;
      listing_id: string;
      status: PromotionStatus;
      starts_at: string | null;
      expires_at: string | null;
      duration_days: number;
      is_gift: boolean;
    }[],
);
