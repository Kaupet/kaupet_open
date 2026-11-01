import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getOrganizationReviews, getUserReviews } from "@/lib/reviews.functions";

/** Hvem profilen tilhører: en bedrift eller en privat bruker. */
export type ReviewSubject = { organizationId: string } | { userId: string };

export function formatRating(value: number): string {
  return value.toLocaleString("nb-NO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function reviewCountLabel(count: number): string {
  return `${count} ${count === 1 ? "vurdering" : "vurderinger"}`;
}

/** Delt mellom toppseksjonen, fanene og vurderingslisten; React Query slår dem sammen. */
export function useProfileReviews(subject: ReviewSubject) {
  const getOrganization = useServerFn(getOrganizationReviews);
  const getUser = useServerFn(getUserReviews);
  return useInfiniteQuery({
    queryKey:
      "organizationId" in subject
        ? ["organization-reviews", subject.organizationId]
        : ["user-reviews", subject.userId],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      "organizationId" in subject
        ? getOrganization({ data: { organizationId: subject.organizationId, offset: pageParam } })
        : getUser({ data: { userId: subject.userId, offset: pageParam } }),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((count, page) => count + page.reviews.length, 0);
      return lastPage.reviews.length && loaded < lastPage.review_count ? loaded : undefined;
    },
  });
}
