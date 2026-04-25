import type { Shop } from "@/db/schema";
import { shopifyGraphQL } from "./api-client";

export interface InventoryItemInfo {
  id: string;
  sku: string;
  tracked: boolean;
  /**
   * Location GID where this item is currently stocked. Picked from the first
   * inventoryLevel returned. Null if the item has no inventory levels yet
   * (item not stocked anywhere). Worker uses this to avoid guessing a
   * location that doesn't actually have the item.
   */
  stockedLocationGid: string | null;
}

export async function fetchInventoryItemBySku(opts: {
  shop: Shop;
  sku: string;
}): Promise<InventoryItemInfo | null> {
  if (!opts.sku) return null;
  const data = await shopifyGraphQL<{
    inventoryItems: {
      edges: Array<{
        node: {
          id: string;
          sku: string;
          tracked: boolean;
          inventoryLevels: { edges: Array<{ node: { location: { id: string } } }> };
        };
      }>;
    };
  }>({
    shop: opts.shop,
    query: /* GraphQL */ `
      query ItemBySku($query: String!) {
        inventoryItems(first: 1, query: $query) {
          edges {
            node {
              id
              sku
              tracked
              inventoryLevels(first: 1) {
                edges { node { location { id } } }
              }
            }
          }
        }
      }
    `,
    variables: { query: `sku:${opts.sku}` },
  });
  const node = data.inventoryItems.edges[0]?.node;
  if (!node) return null;
  return {
    id: node.id,
    sku: node.sku,
    tracked: node.tracked,
    stockedLocationGid: node.inventoryLevels.edges[0]?.node.location.id ?? null,
  };
}

export async function fetchInventoryItemById(opts: {
  shop: Shop;
  inventoryItemId: number;
}): Promise<InventoryItemInfo | null> {
  const gid = `gid://shopify/InventoryItem/${opts.inventoryItemId}`;
  const data = await shopifyGraphQL<{
    inventoryItem: {
      id: string;
      sku: string;
      tracked: boolean;
      inventoryLevels: { edges: Array<{ node: { location: { id: string } } }> };
    } | null;
  }>({
    shop: opts.shop,
    query: /* GraphQL */ `
      query Item($id: ID!) {
        inventoryItem(id: $id) {
          id
          sku
          tracked
          inventoryLevels(first: 1) {
            edges { node { location { id } } }
          }
        }
      }
    `,
    variables: { id: gid },
  });
  const node = data.inventoryItem;
  if (!node) return null;
  return {
    id: node.id,
    sku: node.sku,
    tracked: node.tracked,
    stockedLocationGid: node.inventoryLevels.edges[0]?.node.location.id ?? null,
  };
}

export async function fetchPrimaryLocationId(opts: { shop: Shop }): Promise<string> {
  const data = await shopifyGraphQL<{
    locations: { edges: Array<{ node: { id: string; isActive: boolean } }> };
  }>({
    shop: opts.shop,
    query: /* GraphQL */ `
      query Locations {
        locations(first: 5, query: "active:true") {
          edges { node { id isActive } }
        }
      }
    `,
  });
  const first = data.locations.edges.find((e) => e.node.isActive);
  if (!first) throw new Error(`Shop ${opts.shop.shopDomain} has no active location`);
  return first.node.id;
}

export async function setInventoryOnHand(opts: {
  shop: Shop;
  inventoryItemGid: string;
  locationGid: string;
  quantity: number;
  reason?: string;
}): Promise<void> {
  const data = await shopifyGraphQL<{
    inventorySetOnHandQuantities: {
      userErrors: Array<{ field: string[]; message: string; code: string }>;
    };
  }>({
    shop: opts.shop,
    query: /* GraphQL */ `
      mutation SetOnHand($input: InventorySetOnHandQuantitiesInput!) {
        inventorySetOnHandQuantities(input: $input) {
          userErrors { field message code }
        }
      }
    `,
    variables: {
      input: {
        reason: opts.reason ?? "correction",
        referenceDocumentUri: "storebridge://inventory-sync",
        setQuantities: [
          {
            inventoryItemId: opts.inventoryItemGid,
            locationId: opts.locationGid,
            quantity: opts.quantity,
          },
        ],
      },
    },
  });
  const errs = data.inventorySetOnHandQuantities.userErrors;
  if (errs.length > 0) {
    throw new Error(`inventorySetOnHandQuantities errors: ${errs.map((e) => `${e.code} ${e.message}`).join("; ")}`);
  }
}
