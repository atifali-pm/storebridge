"use client";

import { Page, Card, Text, BlockStack, Banner, Link } from "@shopify/polaris";

type State = "installed" | "not_installed" | "invalid";

interface Props {
  state: State;
  shop?: string;
  host?: string;
  installedAt?: string;
}

export function EmbeddedHome({ state, shop, host, installedAt }: Props) {
  if (state === "invalid") {
    return (
      <Page title="StoreBridge">
        <Banner tone="critical" title="Missing or invalid shop parameter">
          <p>
            Open this app from your Shopify admin (Apps → StoreBridge). Direct URL access
            requires a valid <code>?shop=&lt;name&gt;.myshopify.com</code> query parameter.
          </p>
        </Banner>
      </Page>
    );
  }

  if (state === "not_installed") {
    const installHref = shop
      ? `/api/auth/shopify/install?shop=${encodeURIComponent(shop)}`
      : "/api/auth/shopify/install";
    return (
      <Page title="StoreBridge">
        <Banner tone="warning" title="App not installed on this shop">
          <p>
            Start the install flow:{" "}
            <Link url={installHref} external={false}>
              Install StoreBridge on {shop}
            </Link>
          </p>
        </Banner>
      </Page>
    );
  }

  return (
    <Page title="StoreBridge" subtitle={shop}>
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              Connected
            </Text>
            <Text as="p">
              Shop: <strong>{shop}</strong>
            </Text>
            {installedAt ? (
              <Text as="p" tone="subdued">
                Installed {new Date(installedAt).toLocaleString()}
              </Text>
            ) : null}
            {host ? (
              <Text as="p" tone="subdued">
                Host: <code>{host}</code>
              </Text>
            ) : null}
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              What's next
            </Text>
            <Text as="p">
              Inventory sync between linked stores — configured in Phase 3.
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
