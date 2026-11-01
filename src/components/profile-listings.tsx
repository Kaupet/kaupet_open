import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { LISTING_RESERVATION_COLUMN } from "@/components/meldinger/trade-availability";
import { ListingCard } from "@/components/listing-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toListingCardData } from "@/lib/listing-card-data";
import {
  filterByListingOwner,
  listingOwnerKey,
  type ListingOwner,
} from "@/lib/listing-owner-scope";

const PAGE_SIZE = 24;

/** Aktive annonser på en profilside, hentet én side om gangen: en
 * stor forhandler skal ikke laste ned alle annonsene sine før noe vises. */
export function ProfileListings({ owner, emptyText }: { owner: ListingOwner; emptyText: string }) {
  const listingsQuery = useInfiniteQuery({
    queryKey: ["profile-listings", listingOwnerKey(owner)],
    initialPageParam: 0,
    getNextPageParam: (lastPage: { nextOffset: number | null }) => lastPage.nextOffset ?? undefined,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from("listings")
        .select(
          `id, kaupet_code, title, subtitle, price_nok, is_free, city, created_at${LISTING_RESERVATION_COLUMN}, listing_images(storage_path, sort_order), attributes, categories(slug)` as const,
        )
        .eq("status", "active");
      query = filterByListingOwner(query, owner);
      const { data, error } = await query
        .order("created_at", { ascending: false })
        .order("id")
        .range(pageParam, pageParam + PAGE_SIZE - 1);
      if (error) throw error;
      const rows = (data ?? []).map((row) =>
        toListingCardData(row as Parameters<typeof toListingCardData>[0]),
      );
      return { rows, nextOffset: rows.length === PAGE_SIZE ? pageParam + PAGE_SIZE : null };
    },
  });
  const listings = useMemo(
    () => listingsQuery.data?.pages.flatMap((page) => page.rows) ?? [],
    [listingsQuery.data],
  );

  return (
    <section aria-labelledby="profile-listings-heading">
      <h2 id="profile-listings-heading" className="sr-only">
        Annonser
      </h2>
      {listingsQuery.isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="aspect-[4/3] rounded-lg" />
          ))}
        </div>
      ) : listingsQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Kunne ikke laste annonsene. Prøv igjen senere.
        </p>
      ) : listings.length ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
          {listingsQuery.hasNextPage && (
            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => void listingsQuery.fetchNextPage()}
                disabled={listingsQuery.isFetchingNextPage}
              >
                {listingsQuery.isFetchingNextPage ? "Laster …" : "Last inn flere annonser"}
              </Button>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      )}
    </section>
  );
}
