import { config } from "dotenv";
import { logger } from "@/lib/logger";
import { startInventorySyncWorker } from "./inventory-sync.worker";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const worker = startInventorySyncWorker();

  logger.info({ event: "worker.started", queue: "inventory-sync" });

  const shutdown = async (signal: string) => {
    logger.info({ event: "worker.shutdown", signal });
    await worker.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err), event: "worker.crashed" });
  process.exit(1);
});
