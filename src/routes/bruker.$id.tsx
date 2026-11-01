import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Info, User as UserIcon } from "lucide-react";

import { AdminUserActions } from "@/components/admin/suspend-user-menu";
import { NativePageHeader } from "@/components/native-page-header";
import { ProfileListings } from "@/components/profile-listings";
import { ProfilePageSkeleton } from "@/components/profile-page-skeleton";
import { ProfileRatingLine, ProfileReviews } from "@/components/profile-reviews";
import { ProfileTabs } from "@/components/profile-tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useProfileReviews } from "@/hooks/use-profile-reviews";
import { formatErrorMessage } from "@/lib/errors";
import { formatMonthYear, initials } from "@/lib/format";
import { getPublicProfile } from "@/lib/profile.functions";
import { describeSafeError } from "@/lib/safe-error";
import { SITE_NAME } from "@/lib/site";

const TABS = ["annonser", "vurderinger"] as const;
type ProfileTab = (typeof TABS)[number];
const TAB_LABELS: Record<ProfileTab, string> = { annonser: "Annonser", vurderinger: "Vurderinger" };

export const Route = createFileRoute("/bruker/$id")({
  validateSearch: (search: Record<string, unknown>): { tab?: ProfileTab } =>
    TABS.includes(search.tab as ProfileTab) ? { tab: search.tab as ProfileTab } : {},
  loader: async ({ params }) => {
    const profile = await getPublicProfile({ data: { userId: params.id } });
    if (!profile) throw notFound();
    return { profile };
  },
  head: ({ loaderData }) => {
    const name = loaderData?.profile?.display_name ?? "Bruker";
    const title = `${name} — ${SITE_NAME}`;
    const desc = loaderData?.profile
      ? `${name} har ${loaderData.profile.review_count} vurdering${loaderData.profile.review_count === 1 ? "" : "er"} på ${SITE_NAME}.`
      : `Brukerprofil på ${SITE_NAME}.`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
      ],
    };
  },
  component: PublicProfilePage,
  pendingComponent: ProfilePageSkeleton,
  pendingMs: 200,
  pendingMinMs: 300,
  errorComponent: ({ error }) => {
    console.error("[profile route] error", describeSafeError(error));
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl">Kunne ikke laste brukerprofilen</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {formatErrorMessage(error, "Prøv på nytt eller gå tilbake til forsiden.")}
        </p>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="font-display text-2xl">Brukeren finnes ikke</h1>
      <Link to="/">
        <Button className="mt-6" variant="outline">
          Til forsiden
        </Button>
      </Link>
    </div>
  ),
});

/**
 * Privat brukerprofil: samme fane-, annonse- og vurderingskomponenter som
 * bedriftsprofilen, men uten merkevare og tydelig merket som privatperson.
 */
function PublicProfilePage() {
  const { id } = Route.useParams();
  const { profile } = Route.useLoaderData();
  const tab = Route.useSearch().tab ?? "annonser";
  const subject = { userId: id };
  const reviewCount = useProfileReviews(subject).data?.pages[0]?.review_count;
  const firstName = profile.display_name.trim().split(/\s+/u)[0] || profile.display_name;

  return (
    <div>
      <NativePageHeader title={profile.display_name} titleFadesIn />
      <header className="mx-auto flex max-w-6xl items-center gap-4 px-4 pb-6 pt-8 sm:gap-6 sm:pt-12">
        <Avatar className="size-20 sm:size-24">
          {profile.avatar_url && (
            <AvatarImage src={profile.avatar_url} alt={`Profilbilde av ${profile.display_name}`} />
          )}
          <AvatarFallback className="bg-primary/10 font-display text-2xl text-primary sm:text-3xl">
            {initials(profile.display_name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
            <UserIcon className="size-3.5" aria-hidden="true" />
            Privatperson
          </span>
          <h1 className="mt-2 break-words font-display text-3xl tracking-tight sm:text-4xl">
            {profile.display_name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Medlem siden {formatMonthYear(profile.created_at)}
          </p>
          <p className="mt-3 text-sm">
            <ProfileRatingLine subject={subject} />
          </p>
        </div>
        <AdminUserActions userId={id} displayName={profile.display_name ?? "brukeren"} />
      </header>
      <div className="mx-auto max-w-6xl px-4 pb-6">
        <p className="flex items-start gap-2.5 rounded-xl bg-muted px-4 py-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Dette er en privat selger. Handel mellom privatpersoner følger kjøpsloven, ikke
          forbrukerkjøpsloven.
        </p>
      </div>

      <ProfileTabs
        label="Faner i brukerprofilen"
        current={tab}
        tabs={TABS.map((key) => ({
          key,
          label: TAB_LABELS[key],
          count: key === "vurderinger" ? reviewCount : undefined,
        }))}
      />

      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        {tab === "annonser" ? (
          <>
            <ProfileListings owner={subject} emptyText="Brukeren har ingen aktive annonser." />
            <ProfileReviews
              subject={subject}
              emptyText="Brukeren har ingen vurderinger ennå."
              preview={{
                heading: `Hva andre sier om ${firstName}`,
                allReviewsLink: (label) => (
                  <Link
                    to="/bruker/$id"
                    params={{ id }}
                    search={{ tab: "vurderinger" }}
                    className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
                  >
                    {label}
                  </Link>
                ),
              }}
            />
          </>
        ) : (
          <ProfileReviews subject={subject} emptyText="Brukeren har ingen vurderinger ennå." />
        )}
      </div>
    </div>
  );
}
