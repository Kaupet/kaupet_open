import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const getMutationRule = {
  selector:
    "CallExpression[callee.property.name='handler']" +
    ":has(CallExpression[callee.name='createServerFn'] Property[key.name='method'] > Literal[value='GET'])" +
    ":has(CallExpression[callee.property.name=/^(insert|update|upsert|delete)$/])",
  message:
    'GET-serverfunksjoner skal være lesende. Kapselsesjonen sendes automatisk på GET, så en muterende GET er et CSRF-hull (CSRF-middlewaren i src/start.ts unntar GET). Bruk method: "POST" for skriveoperasjoner.',
};

// Forventede brukerfeil i serverfunksjoner skal være ClientError (se blokken
// for *.functions.ts lenger ned).
const clientErrorRule = {
  selector:
    "ThrowStatement > NewExpression[callee.name='Error'] > Literal:first-child" +
    ":not([value=/^(Noe gikk galt|Kunne ikke)/])",
  message:
    "Forventede brukerfeil skal kastes som new ClientError(melding, status) (400/401/403/404/409/429); uventede feil via toClientError(). Se src/lib/to-client-error.ts.",
};

const vehicleImportRegex = "(vehicle|360)(?!.*/register$)";
const vehicleImportMessage =
  "Kjernen skal ikke importere kjøretøymodulen. Utvid et registreringspunkt i src/lib/verticals.ts (eller CategoryBehavior) og registrer kjøretøyet fra src/lib/vehicle/register.ts.";

// Dynamisk import() er ikke dekket av no-restricted-imports. esquery krever
// at «/» i et regex-uttrykk escapes.
// Kjernen nevner ikke kjøretøy: ingen identifikatorer med «vehicle», ingen
// feltgruppenøkler som «vehicle-facts» og ingen av de gamle filtertypene
// brand_select/model_select (nå parent_select/child_select). Det kjernen
// trenger å vite, står som flagg på registreringspunktene.
const verticalTermMessage =
  "Kjernen skal ikke kjenne kjøretøy. Bruk et registreringspunkt i src/lib/verticals.ts (f.eks. flaggene på VerticalFieldGroup, VerticalFlow eller CategoryBehavior) og registrer verdien fra src/lib/vehicle/register.ts.";
const vehicleTermRules = [
  { selector: "Identifier[name=/vehicle/i]", message: verticalTermMessage },
  {
    selector:
      ":matches(Literal[value=/^(brand|model)_select$/], Identifier[name=/^(brand|model)_select$/])",
    message: verticalTermMessage,
  },
  { selector: "Literal[value=/^vehicle-/]", message: verticalTermMessage },
];

const vehicleDynamicImportRule = {
  selector: `ImportExpression[source.value=/${vehicleImportRegex.replaceAll("/", "\\/")}/]`,
  message: vehicleImportMessage,
};

const serverOnlyPath = {
  name: "server-only",
  message:
    "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
};
const clientCodeDirs = [
  "src/routes/**/*.{ts,tsx}",
  "src/components/**/*.{ts,tsx}",
  "src/features/**/*.{ts,tsx}",
];
// Tester kjører i Node og kan importere *.server-moduler.
const testFiles = ["**/*.test.{ts,tsx}"];
const clientServerImportPattern = {
  group: ["@/**/*.server", "@/**/*.server.*", "**/*.server", "**/*.server.*"],
  message:
    "Client-reachable code must not import *.server modules. Move shared types/constants to a neutral module and import that instead.",
};

// Hele src er kjernen og kan ikke importere kjøretøymodulen (se blokken
// lenger ned).
const notInOpenAsIs = [];

export default tseslint.config(
  {
    ignores: [
      "dist",
      "coverage",
      ".output",
      ".vinxi",
      "src/integrations/supabase/types.ts",
      "src/routeTree.gen.ts",
      "android/.gradle/**",
      "android/app/build/**",
      "android/build/**",
      ".claude/worktrees/**",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "jsx-a11y/label-has-associated-control": [
        "error",
        // Radix primitives that render a focusable control but aren't
        // recognized by the rule's default (native-tag-only) control list.
        { controlComponents: ["Checkbox", "Switch", "RadioGroupItem"] },
      ],
      // Existing, audited prop/browser-state synchronization sites are
      // baselined in eslint-suppressions.json. The rule remains an error so
      // new sites fail lint instead of silently expanding that baseline.
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/static-components": "warn",
      "react-hooks/incompatible-library": "error",
      // Remaining findings are React Hook Form callback refs/render-props,
      // tracked explicitly in eslint-suppressions.json. New ref reads fail.
      "react-hooks/refs": "error",
      "no-restricted-imports": ["error", { paths: [serverOnlyPath] }],
      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
          allowExportNames: [
            "Route",
            // Stable companion APIs intentionally colocated with their
            // component/provider. Keep this explicit so new mixed exports
            // still surface instead of disabling Fast Refresh validation.
            "describeAttrValue",
            "useAllCategoryFilters",
            "isBoatAttributes",
            "clampToBounds",
            "scaleAround",
            "defaultMarkerIcon",
            "CIRCLE_STYLE",
            "LISTING_REPORT_REASONS",
            "USER_REPORT_REASONS",
            "useVehicleBrandOptions",
            "useVehicleModelOptionsGrouped",
            "useVehicleModelOptionsForBrands",
            "useSearchPanel",
            "useRegisterSearchPanelResults",
            "countActiveFilters",
            "useTheme",
          ],
        },
      ],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // TanStack Router route modules export `Route`; their component functions
    // stay local and are referenced from that route object. The generic React
    // Refresh rule misclassifies those local functions as missing component
    // exports, while TanStack's Vite plugin owns route HMR/code splitting.
    files: ["src/routes/**/*.{ts,tsx}"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    // Klientnær kode (ruter, komponenter, features) importerer aldri
    // *.server-moduler. Står etter den generelle blokken, som ellers ville
    // erstattet regelen; kjøretøyblokken under gjentar mønsteret for kjernen.
    files: clientCodeDirs,
    ignores: testFiles,
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [serverOnlyPath], patterns: [clientServerImportPattern] },
      ],
    },
  },
  {
    // GET-serverfunksjoner må være lesende.
    //
    // Sesjonen ligger nå i informasjonskapsler (se
    // src/integrations/supabase/client.ts), og kapsler sendes automatisk med
    // på top-level GET-navigasjoner. En muterende GET er derfor et CSRF-hull:
    // CSRF-middlewaren i src/start.ts unntar bevisst GET fordi GET skal være
    // lesende. Før kapslene var en slik GET ufarlig, fordi bearer-tokenet
    // aldri ble sendt automatisk — nå er den det ikke.
    //
    // Regelen treffer .insert/.update/.upsert/.delete inne i handleren til en
    // createServerFn({ method: "GET" }). Begrensning: den kan ikke se hva en
    // .rpc() gjør. De 11 RPC-ene som i dag kalles fra GET er gjennomgått og
    // lesende, og ti av dem er deklarert STABLE, som Postgres håndhever.
    // Nye RPC-er som kalles fra GET må verifiseres manuelt — helst ved å
    // deklarere dem STABLE.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", getMutationRule],
    },
  },
  {
    // Forventede brukerfeil i serverfunksjoner skal være ClientError (riktig
    // HTTP-status, logges som advarsel). En bar `throw new Error("...")` blir
    // HTTP 500 + console.error. Ekte serverfeil ("Noe gikk galt…", "Kunne ikke…")
    // er unntatt. Samme regel som GET-regelen over må gjentas her, siden en
    // senere blokk erstatter en tidligere.
    files: ["src/**/*.functions.ts"],
    rules: {
      "no-restricted-syntax": ["error", getMutationRule, clientErrorRule],
    },
  },
  {
    // Kjernen er vertikal-agnostisk: den importerer aldri kjøretøymodulen
    // (filer og mapper med «vehicle» eller «360» i navnet), heller ikke med
    // dynamisk import(). Kjøretøy kobler seg inn via registreringspunktene i
    // src/lib/verticals.ts fra src/lib/vehicle/register.ts, som bare
    // router.tsx (og tester) importerer. Utvid et registreringspunkt eller
    // CategoryBehavior (src/lib/category-behavior.ts) i stedet; spredte
    // isVehicle-sjekker i generisk kode gir feil på tvers av kategorier.
    //
    // Ligger etter GET- og ClientError-blokkene fordi en senere blokk
    // erstatter regelens valg: no-restricted-imports og no-restricted-syntax
    // gjentar derfor valgene derfra.
    files: ["src/**/*.{ts,tsx}"],
    ignores: notInOpenAsIs,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [serverOnlyPath],
          patterns: [{ regex: vehicleImportRegex, message: vehicleImportMessage }],
        },
      ],
      "no-restricted-syntax": [
        "error",
        getMutationRule,
        vehicleDynamicImportRule,
        ...vehicleTermRules,
      ],
    },
  },
  {
    files: ["src/**/*.functions.ts"],
    ignores: notInOpenAsIs,
    rules: {
      "no-restricted-syntax": [
        "error",
        getMutationRule,
        clientErrorRule,
        vehicleDynamicImportRule,
        ...vehicleTermRules,
      ],
    },
  },
  {
    // Kjøretøyblokken erstatter no-restricted-imports fra blokken for
    // klientnær kode; gjenta *.server-mønsteret for kjernefilene der.
    files: clientCodeDirs,
    ignores: [...notInOpenAsIs, ...testFiles],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [serverOnlyPath],
          patterns: [
            clientServerImportPattern,
            { regex: vehicleImportRegex, message: vehicleImportMessage },
          ],
        },
      ],
    },
  },
  eslintConfigPrettier,
);
