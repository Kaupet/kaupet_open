import { describe, expect, it } from "vitest";

import { buildSecurityHeaders } from "./security-headers";
import { POWERED_BY } from "./site";

it("lar WebKit laste ressurser fra lokal HTTP-server", () => {
  expect(buildSecurityHeaders({ development: true })["content-security-policy"]).not.toContain(
    "upgrade-insecure-requests",
  );
  expect(buildSecurityHeaders({ development: false })["content-security-policy"]).toContain(
    "upgrade-insecure-requests",
  );
});

// L40: enforce crawler exclusion in HTTP, before client hydration.
it.each(["staging", "test"])("utelukker %s fra søkeindekser", (environment) => {
  expect(buildSecurityHeaders({ environment })["x-robots-tag"]).toBe("noindex, nofollow");
});

it.each(["production", "development", undefined])(
  "hindrer ikke indeksering for miljøet %s",
  (environment) => {
    expect(buildSecurityHeaders({ environment })["x-robots-tag"]).toBeUndefined();
  },
);

describe("buildSecurityHeaders", () => {
  it("tillater SSR-script med nonce uten unsafe-inline", () => {
    const csp = buildSecurityHeaders({ scriptNonce: "abc123" })["content-security-policy"];
    const scriptSrcDirective = csp.split("; ").find((d) => d.startsWith("script-src "));

    expect(scriptSrcDirective).toContain("'nonce-abc123'");
    expect(scriptSrcDirective).not.toContain("unsafe-inline");
  });

  it("har ingen script unsafe-inline uten request-nonce heller", () => {
    const csp = buildSecurityHeaders({})["content-security-policy"];
    const scriptSrcDirective = csp.split("; ").find((d) => d.startsWith("script-src "));

    expect(scriptSrcDirective).not.toContain("unsafe-inline");
  });

  it("inkluderer både r2PublicBaseUrl og r2Endpoint i img-src direktivet", () => {
    const headers = buildSecurityHeaders({
      r2PublicBaseUrl: "https://bilder.example.no",
      r2Endpoint: "https://abc123.r2.cloudflarestorage.com",
    });

    const csp = headers["content-security-policy"];
    const imgSrcDirective = csp.split("; ").find((d) => d.startsWith("img-src "));

    expect(imgSrcDirective).toContain("https://bilder.example.no");
    expect(imgSrcDirective).toContain("https://abc123.r2.cloudflarestorage.com");
  });

  it("krediterer prosjektet i x-powered-by med bare latin-1-tegn", () => {
    const value = buildSecurityHeaders({})["x-powered-by"];

    expect(value).toBe(POWERED_BY);
    // Headerverdier er latin-1: ingen em-dash eller andre tegn over 0x7e.
    expect(value).toMatch(/^[\x20-\x7e]+$/);
  });

  it("inneholder aldri wildcard for alle r2.cloudflarestorage.com kontoer", () => {
    const headers = buildSecurityHeaders({
      r2PublicBaseUrl: "https://bilder.example.no",
      r2Endpoint: "https://abc123.r2.cloudflarestorage.com",
    });

    const csp = headers["content-security-policy"];

    expect(csp).not.toContain("*.r2.cloudflarestorage.com");
  });

  it("utelater undefined-strengen når r2PublicBaseUrl mangler", () => {
    const headers = buildSecurityHeaders({
      r2Endpoint: "https://abc123.r2.cloudflarestorage.com",
    });

    const csp = headers["content-security-policy"];
    const imgSrcDirective = csp.split("; ").find((d) => d.startsWith("img-src "));

    expect(imgSrcDirective).not.toContain("undefined");
    // Sjekk også at det ikke er doble mellomrom
    expect(imgSrcDirective).not.toMatch(/ {2}/);
  });

  it("utelater r2.cloudflarestorage.com når r2Endpoint mangler", () => {
    const headers = buildSecurityHeaders({
      r2PublicBaseUrl: "https://bilder.example.no",
    });

    const csp = headers["content-security-policy"];
    const imgSrcDirective = csp.split("; ").find((d) => d.startsWith("img-src "));

    expect(imgSrcDirective).not.toContain("r2.cloudflarestorage.com");
  });

  it("tillater den konfigurerte Supabase-URL-en i connect-src (lokal E2E)", () => {
    const csp = buildSecurityHeaders({ supabaseUrl: "http://127.0.0.1:54321/" })[
      "content-security-policy"
    ];
    const connectSrcDirective = csp.split("; ").find((d) => d.startsWith("connect-src "));

    expect(connectSrcDirective).toContain(" http://127.0.0.1:54321 ");
    expect(connectSrcDirective).toContain(" ws://127.0.0.1:54321");
    expect(buildSecurityHeaders({})["content-security-policy"]).not.toContain("undefined");
  });
  it("tillater ikke direkte stedsoppslag fra nettleseren", () => {
    const csp = buildSecurityHeaders({})["content-security-policy"];
    expect(csp).not.toContain("nominatim.openstreetmap.org");
    expect(csp).not.toContain("api.kartverket.no");
    expect(csp).not.toContain("https://cache.kartverket.no");
    expect(csp).not.toContain("challenges.cloudflare.com");
    expect(csp).toContain("frame-src 'none'");
  });
});
