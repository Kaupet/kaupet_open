// kaupet_open: explicit public/read-only/unavailable contracts.
// Every createServerFn must use an auth middleware, or be listed in ALLOWLIST
// below with a reason. Catches "forgotten auth" vs "deliberately public".
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const AUTH_MIDDLEWARE = ["requireSupabaseAuth"];

// key: "file#exportName" -> reason
const ALLOWLIST = {
  "src/lib/geocode.functions.ts#searchPlacesFn": "public location lookup, shared IP rate limit",
  "src/lib/geocode.functions.ts#lookupPostalCodeFn": "public location lookup, shared IP rate limit",
  "src/lib/geocode.functions.ts#reverseGeocodeAddressFn":
    "public location lookup, shared IP rate limit",
  "src/lib/geocode.functions.ts#geocodeNorwayAddressFn":
    "public location lookup, shared IP rate limit",
  "src/lib/geocode.functions.ts#geocodeStreetAddressFn":
    "public location lookup, shared IP rate limit",
  "src/lib/category-suggestion.functions.ts#getPhotoSuggestionAvailability":
    "unavailable feature; always disabled",
  "src/lib/category-suggestion.functions.ts#suggestCategoryForTitle":
    "unavailable feature; returns no suggestions",
  "src/lib/category-suggestion.functions.ts#suggestCategoryForTitleWithAi":
    "unavailable feature; returns no suggestions",
  "src/lib/category-suggestion.functions.ts#suggestListingFromPhotos":
    "unavailable feature; returns unavailable",
  "src/lib/current-user.functions.ts#getSessionUser": "cookie session, returns null when anonymous",
  "src/lib/keyword-suggestion.functions.ts#suggestKeywordsForListing":
    "unavailable feature; returns an empty list",
  "src/lib/listing-views.functions.ts#logListingView":
    "anonymous analytics, DB rate limit by IP hash",
  "src/lib/listings.functions.ts#getListingKaupetCodeById": "public read, active listings only",
  "src/lib/my-listings.functions.ts#getMyListingRows":
    "inline getUser on cookie session, returns [] when anonymous",
  "src/lib/profile.functions.ts#getPublicProfile": "public profile read",
  "src/lib/reviews.functions.ts#getUserReviews": "public reviews read, buyer first name only",
  "src/lib/reviews.functions.ts#getOrganizationReviews":
    "public business reviews read, no employee identities",
  "src/lib/wtb-listings.functions.ts#matchWtbListingsForListing": "public aggregate count",
  "src/features/setup/setup.functions.ts#getSetupStatus":
    "public installation-state read; returns no credentials",
  "src/features/setup/setup.functions.ts#checkSetupConnection":
    "installation requires validated service-role credential",
  "src/features/setup/setup.functions.ts#completeSetup":
    "first-admin installation requires validated service-role credential and state check",
  "src/lib/business/organization.functions.ts#getBusinessOrganization":
    "unavailable feature; returns empty membership only",
  "src/lib/promotions.functions.ts#reconcilePromotionPayment":
    "unavailable feature; no mutation or external call",
  "src/lib/promotions.functions.ts#getMyActivePromotions":
    "unavailable feature; returns an empty list",
  "src/lib/reviews.functions.ts#createReview": "unavailable feature; always rejects",
  "src/lib/reviews.functions.ts#getMyReviewForListing": "unavailable feature; returns null",
  "src/lib/wtb-listings.functions.ts#deleteWtbListing": "unavailable feature; always rejects",
  "src/lib/wtb-listings.functions.ts#getMyWtbListings":
    "unavailable feature; returns an empty list",
};

const found = new Map(); // key -> { hasAuth, line }

function visit(path) {
  for (const entry of readdirSync(path)) {
    const fullPath = join(path, entry);
    if (statSync(fullPath).isDirectory()) {
      visit(fullPath);
      continue;
    }
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
    const source = readFileSync(fullPath, "utf8");
    if (!source.includes("createServerFn(")) continue;
    const file = relative(process.cwd(), fullPath);
    const sf = ts.createSourceFile(fullPath, source, ts.ScriptTarget.Latest, true);
    const walk = (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "createServerFn"
      ) {
        // Climb the .a(...).b(...) chain up to and including .handler(...).
        let chainEnd = node;
        let chainText = "";
        while (
          ts.isPropertyAccessExpression(chainEnd.parent) &&
          chainEnd.parent.expression === chainEnd &&
          ts.isCallExpression(chainEnd.parent.parent)
        ) {
          if (chainEnd.parent.name.text === "handler") break;
          chainEnd = chainEnd.parent.parent;
          chainText = chainEnd.getText(sf);
        }
        let decl = node.parent;
        while (decl && !ts.isVariableDeclaration(decl)) decl = decl.parent;
        const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const name = decl && ts.isIdentifier(decl.name) ? decl.name.text : `<anonymous@${line}>`;
        found.set(`${file}#${name}`, {
          hasAuth: AUTH_MIDDLEWARE.some((m) => chainText.includes(m)),
          line,
        });
      }
      ts.forEachChild(node, walk);
    };
    walk(sf);
  }
}

visit("src");

const errors = [];
for (const [key, { hasAuth, line }] of found) {
  if (!hasAuth && !(key in ALLOWLIST)) {
    errors.push(`${key} (line ${line}): no auth middleware and not in ALLOWLIST`);
  }
  if (hasAuth && key in ALLOWLIST) {
    errors.push(`${key}: uses auth middleware but is still in ALLOWLIST — remove the entry`);
  }
}
for (const key of Object.keys(ALLOWLIST)) {
  if (!found.has(key)) errors.push(`${key}: ALLOWLIST entry no longer exists — remove it`);
}

if (errors.length > 0) {
  console.error(
    "createServerFn auth check failed. Add .middleware([requireSupabaseAuth]) or, if deliberately\n" +
      "public/self-authorizing, add the function to ALLOWLIST in scripts/check-server-fn-auth.mjs:\n" +
      errors.map((e) => `  - ${e}`).join("\n"),
  );
  process.exit(1);
}
const withAuth = [...found.values()].filter((f) => f.hasAuth).length;
console.log(
  `Server fn auth OK: ${withAuth} with middleware, ${Object.keys(ALLOWLIST).length} allowlisted.`,
);
