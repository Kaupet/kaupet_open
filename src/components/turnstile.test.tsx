// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { isTurnstileEnabled, Turnstile } from "./turnstile";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
it("aktiverer aldri ekstern CAPTCHA selv om en gammel site key finnes", () => {
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "old-site-key");
  expect(isTurnstileEnabled()).toBe(false);
  const { container } = render(<Turnstile siteKey="old-site-key" />);
  expect(container.innerHTML).toBe("");
  expect(document.querySelector("script[src*='challenges.cloudflare.com']")).toBeNull();
});
