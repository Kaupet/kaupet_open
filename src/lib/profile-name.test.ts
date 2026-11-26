import { expect, it } from "vitest";
import { profileNameSchema, profileSignupNameSchema, profileSignupMetadata } from "./profile-name";

it.each([
  ["Kari", true],
  ["Al", true],
  ["A", false],
  ["A".repeat(80), true],
  ["A".repeat(81), false],
  ["", false],
  [null, false],
  [undefined, false],
  [123, false],
  ["Æøå 🐱", true],
  ["A".repeat(10000), false],
])("validerer grenseverdier for visningsnavnet: %j", (firstName, valid) => {
  expect(
    profileNameSchema.safeParse({ firstName, lastName: "", showLastName: false }).success,
  ).toBe(valid);
});

it("sender bare visningsnavnet til Auth, selv om skjemaet inneholder private navnefelt", () => {
  expect(
    profileSignupMetadata(
      { firstName: " Kari ", lastName: "Privat", showLastName: true },
      "kari@example.com",
    ),
  ).toEqual({
    display_name: "Kari",
  });
});

it.each([
  ["", true],
  ["A", true],
  ["A".repeat(50), true],
  ["A".repeat(51), false],
])("beholder valgfritt visningsnavn og registreringsgrensen: %j", (firstName, valid) => {
  expect(
    profileSignupNameSchema.safeParse({ firstName, lastName: "", showLastName: false }).success,
  ).toBe(valid);
});

it("bruker e-postens lokale del når registreringen mangler visningsnavn", () => {
  expect(
    profileSignupMetadata({ firstName: "", lastName: "", showLastName: false }, "kari@example.com"),
  ).toEqual({ display_name: "kari" });
});
