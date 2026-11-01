import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/star-rating";
import {
  formatRating,
  reviewCountLabel,
  useProfileReviews,
  type ReviewSubject,
} from "@/hooks/use-profile-reviews";
import type { ReviewPage } from "@/lib/reviews.functions";

type Review = ReviewPage["reviews"][number];

function ReviewMeta({ review }: { review: Review }) {
  // `role` er rollen til den som skrev: «seller» betyr at profilen kjøpte.
  const reviewerSold = review.role === "seller";
  return (
    <p className="text-xs text-muted-foreground">
      {review.reviewer_name ?? (reviewerSold ? "Selger" : "Kjøper")}
      {review.listing && (
        <>
          {reviewerSold ? " · solgte " : " · kjøpte "}
          <Link
            to="/$kaupetCode"
            params={{ kaupetCode: review.listing.kaupet_code }}
            className="underline-offset-4 hover:underline"
          >
            {review.listing.title}
          </Link>
        </>
      )}
      {" · "}
      {new Date(review.created_at).toLocaleDateString("nb-NO", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}
    </p>
  );
}

/** Stjerner, snitt og antall i toppseksjonen på en profilside. */
export function ProfileRatingLine({ subject }: { subject: ReviewSubject }) {
  const summary = useProfileReviews(subject).data?.pages[0];
  if (!summary) return null;
  if (!summary.review_count) return <span className="opacity-80">Ingen vurderinger ennå</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <StarRating value={summary.avg_rating} readOnly size={16} />
      <span className="font-semibold">{formatRating(summary.avg_rating)}</span>
      <span className="sr-only">av 5 stjerner,</span>
      <span className="opacity-80">{reviewCountLabel(summary.review_count)}</span>
    </span>
  );
}

function ReviewStars({ rating }: { rating: number }) {
  return (
    <>
      <StarRating value={rating} readOnly size={16} />
      <span className="sr-only">{rating} av 5 stjerner</span>
    </>
  );
}

/** Privatprofilen vurderes både som selger og kjøper; bedrifter bare som selger. */
function RoleBadge({ review }: { review: Review }) {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
      {review.role === "seller" ? "Som kjøper" : "Som selger"}
    </span>
  );
}

function RatingDistribution({ counts, total }: { counts: number[]; total: number }) {
  return (
    <ul className="mt-5 space-y-2" aria-label="Fordeling av vurderinger">
      {[5, 4, 3, 2, 1].map((stars) => {
        const count = counts[stars - 1] ?? 0;
        return (
          <li key={stars} className="flex items-center gap-3 text-sm">
            <span className="w-3 text-muted-foreground" aria-hidden="true">
              {stars}
            </span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${total ? (count / total) * 100 : 0}%` }}
              />
            </span>
            <span className="w-8 text-right text-muted-foreground">
              <span className="sr-only">{stars} stjerner: </span>
              {count}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Felles vurderingsvisning for bedrifts- og brukerprofilen. `preview` viser de
 * tre nyeste vurderingene som kort med en lenke til alle (fanen «Annonser»);
 * ellers vises sammendrag, fordeling og hele listen.
 */
export function ProfileReviews({
  subject,
  preview,
  emptyText,
}: {
  subject: ReviewSubject;
  preview?: { heading: string; allReviewsLink: (label: string) => ReactNode };
  emptyText: string;
}) {
  const query = useProfileReviews(subject);
  const showRole = "userId" in subject;
  const summary = query.data?.pages[0];
  const reviews = query.data?.pages.flatMap((page) => page.reviews) ?? [];

  if (query.isPending) {
    return (
      <p role="status" className="mt-6 text-sm text-muted-foreground">
        Laster vurderinger …
      </p>
    );
  }
  if (query.isError) {
    return (
      <p role="alert" className="mt-6 text-sm text-destructive">
        Kunne ikke laste vurderingene.
      </p>
    );
  }

  if (preview) {
    if (!summary?.review_count) return null;
    return (
      <section
        aria-labelledby="profile-reviews-preview-heading"
        className="mt-12 border-t border-border pt-8"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2
            id="profile-reviews-preview-heading"
            className="font-display text-2xl tracking-tight sm:text-3xl"
          >
            {preview.heading}
          </h2>
          {preview.allReviewsLink(`Se alle ${reviewCountLabel(summary.review_count)}`)}
        </div>
        <ul className="mt-5 grid gap-4 md:grid-cols-3">
          {reviews.slice(0, 3).map((review) => (
            <li key={review.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between gap-2">
                <ReviewStars rating={review.rating} />
                {showRole && <RoleBadge review={review} />}
              </div>
              {review.comment && (
                <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm">{review.comment}</p>
              )}
              <div className="mt-4">
                <ReviewMeta review={review} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section aria-labelledby="profile-reviews-heading" className="mt-8">
      {summary && summary.review_count > 0 ? (
        <div className="flex flex-col gap-8 md:flex-row md:items-start">
          <div className="rounded-2xl border border-border bg-card p-6 md:w-80 md:shrink-0">
            <h2 id="profile-reviews-heading" className="font-display text-2xl">
              Vurderinger
            </h2>
            <p className="mt-4 flex items-baseline gap-2">
              <span className="font-display text-5xl leading-none">
                {formatRating(summary.avg_rating)}
              </span>
              <span className="text-sm text-muted-foreground">av 5</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Basert på {reviewCountLabel(summary.review_count)}
            </p>
            <RatingDistribution counts={summary.rating_counts} total={summary.review_count} />
          </div>
          <div className="min-w-0 flex-1">
            <ul className="space-y-3">
              {reviews.map((review) => (
                <li key={review.id} className="rounded-xl border border-border bg-card p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <ReviewMeta review={review} />
                    <span className="flex items-center gap-2">
                      {showRole && <RoleBadge review={review} />}
                      <ReviewStars rating={review.rating} />
                    </span>
                  </div>
                  {review.comment && (
                    <p className="mt-3 whitespace-pre-wrap text-sm">{review.comment}</p>
                  )}
                </li>
              ))}
            </ul>
            {query.hasNextPage && (
              <Button
                variant="outline"
                className="mt-4 min-h-11"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {query.isFetchingNextPage ? "Laster …" : "Last inn flere vurderinger"}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <h2 id="profile-reviews-heading" className="font-display text-2xl">
            Vurderinger
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">{emptyText}</p>
        </>
      )}
    </section>
  );
}
