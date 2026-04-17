import "@shopify/polaris/build/esm/styles.css";
import Script from "next/script";
import { env } from "@/lib/env";
import { EmbeddedProviders } from "./providers";

export default function EmbeddedLayout({ children }: { children: React.ReactNode }) {
  const apiKey = env().SHOPIFY_API_KEY;
  return (
    <>
      <Script
        src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
        data-api-key={apiKey}
        strategy="beforeInteractive"
      />
      <EmbeddedProviders>{children}</EmbeddedProviders>
    </>
  );
}
