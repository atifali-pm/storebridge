import { describe, it, expect } from "vitest";
import { isValidShopDomain } from "@/lib/shopify/oauth";

describe("isValidShopDomain", () => {
  it.each([
    "acme.myshopify.com",
    "acme-dev.myshopify.com",
    "acme123.myshopify.com",
    "a.myshopify.com",
  ])("accepts %s", (s) => {
    expect(isValidShopDomain(s)).toBe(true);
  });

  it.each([
    "",
    "acme.shopify.com",
    "acme.myshopify.com.evil.com",
    "evil.com/acme.myshopify.com",
    "ACME.myshopify.com",
    "-acme.myshopify.com",
    "acme.myshopify.com ",
    "acme .myshopify.com",
    "acme..myshopify.com",
    "acme/admin.myshopify.com",
  ])("rejects %s", (s) => {
    expect(isValidShopDomain(s)).toBe(false);
  });

  it("rejects domains longer than 255 chars", () => {
    const shop = "a".repeat(250) + ".myshopify.com";
    expect(isValidShopDomain(shop)).toBe(false);
  });
});
