import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { searchSchema } from "@/features/listing-search/search-schema";
import { SearchResultsPage } from "@/features/listing-search/search-results-page";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const Route = createFileRoute("/annonser")({
  validateSearch: searchSchema,
  ssr: false,
  head: () => ({
    meta: [
      { title: `Alle annonser — brukte ting til salgs i Norge | ${SITE_NAME}` },
      {
        name: "description",
        content: `Søk og bla gjennom brukte ting til salgs over hele Norge. Filtrer på kategori, pris, tilstand og lokasjon på ${SITE_NAME}.`,
      },
      { property: "og:title", content: `Alle annonser — ${SITE_NAME}` },
      {
        property: "og:description",
        content:
          "Bla gjennom brukte ting til salgs over hele Norge. Filtrer på kategori, pris og sted.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/annonser` },
      { name: "twitter:title", content: `Alle annonser — ${SITE_NAME}` },
      {
        name: "twitter:description",
        content:
          "Bla gjennom brukte ting til salgs over hele Norge. Filtrer på kategori, pris og sted.",
      },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/annonser` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: `Alle annonser på ${SITE_NAME}`,
          description:
            "Brukte ting til salgs i Norge. Søkbar katalog med filtre for kategori, pris, tilstand og lokasjon.",
          url: `${SITE_URL}/annonser`,
          inLanguage: "nb-NO",
          isPartOf: { "@id": `${SITE_URL}/#website` },
        }),
      },
    ],
  }),
  component: BrowsePage,
});

function BrowsePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/annonser" });
  return <SearchResultsPage search={search} navigate={navigate} />;
}
