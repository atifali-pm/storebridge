import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/app/:path*"],
};

const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export function middleware(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get("shop") ?? "";
  const frameAncestors =
    shop && SHOP_RE.test(shop)
      ? `https://${shop} https://admin.shopify.com`
      : "https://admin.shopify.com https://*.myshopify.com";

  const res = NextResponse.next();
  res.headers.set("Content-Security-Policy", `frame-ancestors ${frameAncestors};`);
  res.headers.delete("X-Frame-Options");
  return res;
}
