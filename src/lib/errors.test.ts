import { describe, expect, it } from "vitest";
import { z } from "zod";
import { formatErrorMessage } from "./errors";

describe("formatErrorMessage", () => {
  it.each([
    "Unauthorized: No authorization header provided",
    "Internal Server Error",
    "Rate-limit fingerprint is not configured",
    "The resource already exists",
  ])("viser aldri engelsk melding: %s", (message) => {
    expect(formatErrorMessage(new Error(message), "Noe gikk galt")).toBe("Noe gikk galt");
  });

  it.each([
    "Du må være logget inn for å gjøre dette. Logg inn og prøv igjen.",
    "Ikke autorisert",
    "Fyll inn: Merke, Modell",
    "Kontakt support på kontakt@example.no.",
    "Fant ikke kjøretøy med registreringsnummer AB12345.",
  ])("slipper norsk melding gjennom: %s", (message) => {
    expect(formatErrorMessage(new Error(message), "Noe gikk galt")).toBe(message);
  });

  it.each([
    [{ title: "ab" }, "Tittel må være minst 3 tegn"],
    [{ title: "a".repeat(5) }, "Tittel kan ikke være lengre enn 4 tegn"],
    [{ title: "abc", price_nok: -1 }, "Pris må være minst 0"],
    [{ title: "abc", category_id: "x" }, "Kategori har ugyldig format"],
    [{ title: "abc", condition: "x" }, "Tilstand har en verdi som ikke er tillatt"],
  ])("oversetter Zod-issues: %j", (input, expected) => {
    const schema = z.object({
      title: z.string().min(3).max(4),
      price_nok: z.number().min(0).optional(),
      category_id: z.guid().optional(),
      condition: z.literal("new").optional(),
    });
    expect(formatErrorMessage(schema.safeParse(input).error, "Noe gikk galt")).toBe(expected);
  });

  it.each([
    [
      { code: "too_small", origin: "string", minimum: 4, path: ["title"] },
      "Tittel må være minst 4 tegn",
    ],
    [
      { code: "too_small", origin: "number", minimum: 2, path: ["price_nok"] },
      "Pris må være minst 2",
    ],
    [{ code: "too_small", origin: "array", minimum: 2, path: [] }, "Feltet er for kort"],
    [
      { code: "too_big", origin: "string", maximum: 8, path: ["city"] },
      "Sted kan ikke være lengre enn 8 tegn",
    ],
    [
      { code: "too_big", origin: "number", maximum: 10, path: ["unknown"] },
      "Verdien kan ikke være større enn 10",
    ],
    [{ code: "too_big", origin: "array", maximum: 3, path: [] }, "Feltet er for langt"],
    [{ code: "invalid_type", path: ["email"] }, "E-post mangler eller har feil format"],
    [{ code: "invalid_value", path: ["condition"] }, "Tilstand har en verdi som ikke er tillatt"],
    [
      { code: "custom", message: "Ugyldig kombinasjon", path: ["price_nok"] },
      "Pris: Ugyldig kombinasjon",
    ],
    [{ code: "custom", message: '{"internal":true}' }, "Feltet er ikke gyldig"],
  ])("oversetter flere Zod-feilformer: %j", (issue, expected) => {
    expect(formatErrorMessage({ name: "ZodError", issues: [issue] }, "Noe gikk galt")).toBe(
      expected,
    );
  });

  it.each([
    ["23505", "Denne verdien finnes allerede"],
    ["23503", "Handlingen kan ikke fullføres fordi data er i bruk et annet sted"],
    ["23502", "Et påkrevd felt mangler"],
    ["23514", "Verdien er ikke gyldig"],
    ["42501", "Du har ikke tilgang til denne handlingen"],
    ["PGRST301", "Du har ikke tilgang til denne handlingen"],
    ["PGRST302", "Du har ikke tilgang til denne handlingen"],
    ["PGRST116", "Fant ikke det du lette etter"],
    ["22001", "Innholdet er for langt"],
    ["22P02", "Ugyldig verdi"],
    ["XX000", "Noe gikk galt"],
  ])("oversetter PostgREST-kode %s", (code, expected) => {
    expect(formatErrorMessage({ code, message: "database failure" }, "Noe gikk galt")).toBe(
      expected,
    );
  });

  it.each([
    ["Invalid login credentials", "Feil e-post eller passord"],
    ["User already registered", "Det finnes allerede en konto med denne e-posten"],
    ["Email not confirmed", "Bekreft e-posten din før du logger inn"],
    ["email rate limit exceeded", "For mange e-poster sendt. Vent litt og prøv igjen"],
    ["For security purposes, wait", "For mange forsøk. Vent litt og prøv igjen"],
    ["Password should be at least 12 characters", "Passordet må være minst 12 tegn"],
    ["Password should be at least characters", "Passordet er for kort"],
    ["Password is weak", "Passordet er for svakt. Velg et sterkere passord"],
    ["Invalid email", "Ugyldig e-postadresse"],
    ["User not found", "Fant ingen bruker med denne e-posten"],
    ["Token has expired", "Lenken er utløpt. Be om en ny"],
    ["New password should be different", "Det nye passordet må være annerledes enn det gamle"],
    ["Signups not allowed", "Registrering er ikke tilgjengelig"],
    ["Unsupported provider", "Denne påloggingsmetoden er ikke tilgjengelig"],
    ["Failed to fetch", "Ingen nettverksforbindelse. Prøv igjen"],
    ["unmapped auth problem", "Noe gikk galt"],
  ])("oversetter Auth-feilen %s", (message, expected) => {
    expect(formatErrorMessage({ __isAuthError: true, message }, "Noe gikk galt")).toBe(expected);
  });

  it("oversetter nettverksfeil og beskytter tekniske eller strukturerte meldinger", () => {
    expect(formatErrorMessage(new TypeError("fetch failed"), "Noe gikk galt")).toBe(
      "Ingen nettverksforbindelse. Prøv igjen",
    );
    expect(formatErrorMessage(new Error("Load failed"), "Noe gikk galt")).toBe(
      "Ingen nettverksforbindelse. Prøv igjen",
    );
    expect(
      formatErrorMessage(new Error("duplicate key violates unique constraint"), "Noe gikk galt"),
    ).toBe("Noe gikk galt");
    expect(formatErrorMessage(new Error("[broken json"), "Noe gikk galt")).toBe("Noe gikk galt");
    expect(formatErrorMessage(new Error('{"message":"no details"}'), "Noe gikk galt")).toBe(
      "Noe gikk galt",
    );
    expect(
      formatErrorMessage(new Error('[{"code":"invalid_type","path":["title"]}]'), "Noe gikk galt"),
    ).toBe("Tittel mangler eller har feil format");
    expect(formatErrorMessage("En norsk feilmelding", "Noe gikk galt")).toBe(
      "En norsk feilmelding",
    );
    expect(formatErrorMessage({ message: "" }, "Noe gikk galt")).toBe("Noe gikk galt");
    expect(formatErrorMessage(null, "Noe gikk galt")).toBe("Noe gikk galt");
  });
});
