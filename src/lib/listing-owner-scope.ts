// kaupet_open: annonser eies bare av privatpersoner.
export type ListingOwner = { userId: string };

type OwnerFilterable<Query> = {
  eq: (column: string, value: string) => Query;
};

export function listingOwnerKey(owner: ListingOwner): string {
  return owner.userId;
}

export function filterByListingOwner<Query extends OwnerFilterable<Query>>(
  query: Query,
  owner: ListingOwner,
): Query {
  return query.eq("seller_id", owner.userId);
}
