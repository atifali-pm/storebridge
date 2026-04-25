import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

process.on("uncaughtException", (err) => {
  console.error("[worker] uncaughtException:", err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[worker] unhandledRejection:", reason);
  process.exit(1);
});

console.log("[worker] booting, NODE_ENV=", process.env.NODE_ENV);
console.log("[worker] DATABASE_URL set:", !!process.env.DATABASE_URL);
console.log("[worker] REDIS_URL set:", !!process.env.REDIS_URL);

async function main() {
  console.log("[worker] importing logger and worker module");
  const { logger } = await import("@/lib/logger");
  const { startInventorySyncWorker } = await import("./inventory-sync.worker");

  console.log("[worker] starting BullMQ worker");
  const worker = startInventorySyncWorker();

  logger.info({ event: "worker.started", queue: "inventory-sync" });
  console.log("[worker] ready, awaiting jobs");

  const shutdown = async (signal: string) => {
    logger.info({ event: "worker.shutdown", signal });
    await worker.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[worker] main rejected:", err);
  process.exit(1);
});
