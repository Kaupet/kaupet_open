import { afterEach, expect, it, vi } from "vitest";
import { verifyTurnstileToken } from "./turnstile.server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("publiserer uten ekstern CAPTCHA også i produksjon med gamle nøkler", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "old-secret");
  const fetch = vi.fn(() => {
    throw new Error("Eksternt nettverk er av");
  });
  vi.stubGlobal("fetch", fetch);
  for (const token of [undefined, null, "", "old-token"]) {
    await expect(verifyTurnstileToken(token)).resolves.toBeUndefined();
  }
  expect(fetch).not.toHaveBeenCalled();
});
