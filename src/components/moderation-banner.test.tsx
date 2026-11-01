// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const site = vi.hoisted(() => ({ SUPPORT_EMAIL: "" }));
vi.mock("@/lib/site", () => site);
vi.mock("@/hooks/use-my-moderation-status", () => ({
  useMyModerationStatus: () => ({ data: { is_banned: true, ban_reason: null } }),
}));

import { ModerationBanner } from "./moderation-banner";

afterEach(cleanup);

describe("ModerationBanner", () => {
  it("viser kontaktadressen fra site.ts", () => {
    site.SUPPORT_EMAIL = "hjelp@example.no";
    render(<ModerationBanner />);
    expect(screen.getByRole("link", { name: "hjelp@example.no" }).getAttribute("href")).toBe(
      "mailto:hjelp@example.no",
    );
  });

  it("viser ingen kontakt når adressen er tom", () => {
    site.SUPPORT_EMAIL = "";
    render(<ModerationBanner />);
    expect(screen.getByText("Kontoen din er utestengt")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
