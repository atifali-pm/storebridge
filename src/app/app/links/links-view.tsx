"use client";

import { useMemo, useState } from "react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  Banner,
  Link as PolarisLink,
  Select,
  Button,
  InlineStack,
  TextField,
  Badge,
  Divider,
} from "@shopify/polaris";
import { createLinkAction, deleteLinkAction, toggleLinkAction } from "./actions";

interface ShopSummary {
  id: string;
  shopDomain: string;
  installedAt: string;
  uninstalledAt: string | null;
}

interface LinkRow {
  id: string;
  sourceShopId: string;
  targetShopId: string;
  enabled: boolean;
  matchBy: "sku";
  lastSyncAt: string | null;
  createdAt: string;
}

interface Props {
  state?: "ready" | "not_installed" | "invalid";
  shop?: string;
  host?: string;
  tenantId?: string;
  shops?: ShopSummary[];
  links?: LinkRow[];
  mergeToken?: string;
}

export function LinksView(props: Props) {
  const { state = "ready" } = props;

  if (state === "invalid") {
    return (
      <Page title="Store links">
        <Banner tone="critical" title="Missing shop parameter" />
      </Page>
    );
  }
  if (state === "not_installed") {
    return (
      <Page title="Store links">
        <Banner tone="warning" title="App not installed on this shop">
          <PolarisLink
            url={`/api/auth/shopify/install?shop=${encodeURIComponent(props.shop ?? "")}`}
            external={false}
          >
            Install StoreBridge
          </PolarisLink>
        </Banner>
      </Page>
    );
  }

  const shops = props.shops ?? [];
  const links = props.links ?? [];
  const tenantId = props.tenantId ?? "";
  const currentShop = props.shop ?? "";
  const mergeToken = props.mergeToken ?? "";

  const shopOptions = shops
    .filter((s) => !s.uninstalledAt)
    .map((s) => ({ label: s.shopDomain, value: s.id }));
  const nameById = useMemo(
    () => Object.fromEntries(shops.map((s) => [s.id, s.shopDomain])),
    [shops],
  );

  return (
    <Page title="Store links" subtitle={currentShop}>
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Connected stores ({shops.length})
            </Text>
            {shops.length === 0 ? (
              <Text as="p">No stores yet.</Text>
            ) : (
              <BlockStack gap="200">
                {shops.map((s) => (
                  <InlineStack key={s.id} align="space-between">
                    <Text as="span">{s.shopDomain}</Text>
                    {s.uninstalledAt ? (
                      <Badge tone="warning">Uninstalled</Badge>
                    ) : (
                      <Badge tone="success">Active</Badge>
                    )}
                  </InlineStack>
                ))}
              </BlockStack>
            )}
          </BlockStack>
        </Card>

        <ConnectShopCard mergeToken={mergeToken} currentShop={currentShop} />

        {shops.filter((s) => !s.uninstalledAt).length >= 2 ? (
          <CreateLinkCard
            tenantId={tenantId}
            currentShop={currentShop}
            shopOptions={shopOptions}
          />
        ) : (
          <Card>
            <Text as="p" tone="subdued">
              Connect a second store to create inventory sync links.
            </Text>
          </Card>
        )}

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Links ({links.length})
            </Text>
            {links.length === 0 ? (
              <Text as="p">No links yet.</Text>
            ) : (
              <BlockStack gap="300">
                {links.map((l) => (
                  <LinkItem
                    key={l.id}
                    link={l}
                    tenantId={tenantId}
                    currentShop={currentShop}
                    sourceName={nameById[l.sourceShopId] ?? l.sourceShopId}
                    targetName={nameById[l.targetShopId] ?? l.targetShopId}
                  />
                ))}
              </BlockStack>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

function ConnectShopCard({ mergeToken, currentShop }: { mergeToken: string; currentShop: string }) {
  const [shop, setShop] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    const trimmed = shop.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(trimmed)) {
      setError("Enter a valid *.myshopify.com domain.");
      return;
    }
    const url = `/api/auth/shopify/install?shop=${encodeURIComponent(trimmed)}&merge_into=${encodeURIComponent(mergeToken)}`;
    if (typeof window !== "undefined") {
      window.top ? (window.top.location.href = url) : (window.location.href = url);
    }
  }

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          Connect another store
        </Text>
        <Text as="p" tone="subdued">
          Install StoreBridge on a second dev store under the same tenant. Current shop:{" "}
          <code>{currentShop}</code>.
        </Text>
        <TextField
          label="Shop domain"
          value={shop}
          onChange={setShop}
          placeholder="mystore.myshopify.com"
          autoComplete="off"
        />
        {error ? <Banner tone="critical">{error}</Banner> : null}
        <InlineStack>
          <Button onClick={handleSubmit} variant="primary">
            Start install flow
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

function CreateLinkCard({
  tenantId,
  currentShop,
  shopOptions,
}: {
  tenantId: string;
  currentShop: string;
  shopOptions: { label: string; value: string }[];
}) {
  const [sourceShopId, setSourceShopId] = useState(shopOptions[0]?.value ?? "");
  const [targetShopId, setTargetShopId] = useState(shopOptions[1]?.value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!sourceShopId || !targetShopId || sourceShopId === targetShopId) {
      setError("Pick two different stores.");
      return;
    }
    setPending(true);
    const fd = new FormData();
    fd.set("tenantId", tenantId);
    fd.set("sourceShopId", sourceShopId);
    fd.set("targetShopId", targetShopId);
    fd.set("currentShop", currentShop);
    const res = await createLinkAction(fd);
    setPending(false);
    if (res.error) setError(res.error);
  }

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          New link
        </Text>
        <Text as="p" tone="subdued">
          Inventory changes on the source store propagate to the target store, matched by SKU.
        </Text>
        <InlineStack gap="300" wrap>
          <div style={{ minWidth: 240 }}>
            <Select
              label="Source"
              options={shopOptions}
              value={sourceShopId}
              onChange={setSourceShopId}
            />
          </div>
          <div style={{ minWidth: 240 }}>
            <Select
              label="Target"
              options={shopOptions}
              value={targetShopId}
              onChange={setTargetShopId}
            />
          </div>
        </InlineStack>
        {error ? <Banner tone="critical">{error}</Banner> : null}
        <InlineStack>
          <Button onClick={handleSubmit} variant="primary" loading={pending}>
            Create link
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

function LinkItem(props: {
  link: LinkRow;
  tenantId: string;
  currentShop: string;
  sourceName: string;
  targetName: string;
}) {
  const { link, tenantId, currentShop, sourceName, targetName } = props;
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    const fd = new FormData();
    fd.set("tenantId", tenantId);
    fd.set("linkId", link.id);
    fd.set("enabled", link.enabled ? "false" : "true");
    fd.set("currentShop", currentShop);
    await toggleLinkAction(fd);
    setPending(false);
  }

  async function remove() {
    if (!confirm(`Delete link ${sourceName} → ${targetName}?`)) return;
    setPending(true);
    const fd = new FormData();
    fd.set("tenantId", tenantId);
    fd.set("linkId", link.id);
    fd.set("currentShop", currentShop);
    await deleteLinkAction(fd);
    setPending(false);
  }

  return (
    <>
      <InlineStack align="space-between" blockAlign="center">
        <BlockStack gap="100">
          <Text as="span" variant="bodyMd">
            <strong>{sourceName}</strong> → <strong>{targetName}</strong>
          </Text>
          <Text as="span" tone="subdued" variant="bodySm">
            Match by {link.matchBy}
            {link.lastSyncAt ? ` · last sync ${new Date(link.lastSyncAt).toLocaleString()}` : " · no sync yet"}
          </Text>
        </BlockStack>
        <InlineStack gap="200">
          {link.enabled ? (
            <Badge tone="success">Enabled</Badge>
          ) : (
            <Badge tone="attention">Paused</Badge>
          )}
          <Button onClick={toggle} loading={pending}>
            {link.enabled ? "Pause" : "Enable"}
          </Button>
          <Button tone="critical" onClick={remove} loading={pending}>
            Delete
          </Button>
        </InlineStack>
      </InlineStack>
      <Divider />
    </>
  );
}
