import { Queue, type JobsOptions } from "bullmq";
import { getRedis } from "./connection";

export const QUEUE_INVENTORY_SYNC = "storebridge:inventory-sync";

export interface InventorySyncJobData {
  webhookEventId: string;
  sourceShopDomain: string;
  inventoryItemId: number;
  locationId: number;
  available: number;
}

let cachedInventorySyncQueue: Queue<InventorySyncJobData> | null = null;

export function inventorySyncQueue(): Queue<InventorySyncJobData> {
  if (cachedInventorySyncQueue) return cachedInventorySyncQueue;
  cachedInventorySyncQueue = new Queue<InventorySyncJobData>(QUEUE_INVENTORY_SYNC, {
    connection: getRedis(),
    defaultJobOptions: DEFAULT_JOB_OPTS,
  });
  return cachedInventorySyncQueue;
}

export const DEFAULT_JOB_OPTS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 1_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};
