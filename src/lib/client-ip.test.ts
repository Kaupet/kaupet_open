import { afterEach, describe, expect, it } from "vitest";
import { clientIp } from "./client-ip";

describe("clientIp", () => {
  afterEach(() => {
    delete process.env.CLIENT_IP_HEADER;
  });

  it("foretrekker cf-connecting-ip og tar første adresse i x-forwarded-for", () => {
    expect(clientIp(new Headers({ "cf-connecting-ip": "1.1.1.1", "x-real-ip": "2.2.2.2" }))).toBe(
      "1.1.1.1",
    );
    expect(clientIp(new Headers({ "x-forwarded-for": "3.3.3.3, 10.0.0.1" }))).toBe("3.3.3.3");
    expect(clientIp(new Headers())).toBeNull();
  });

  it("leser bare CLIENT_IP_HEADER når den er satt, så et forfalsket cf-hode ignoreres", () => {
    process.env.CLIENT_IP_HEADER = "x-real-ip";
    expect(clientIp(new Headers({ "cf-connecting-ip": "6.6.6.6", "x-real-ip": "2.2.2.2" }))).toBe(
      "2.2.2.2",
    );
    expect(clientIp(new Headers({ "cf-connecting-ip": "6.6.6.6" }))).toBeNull();
  });
});
