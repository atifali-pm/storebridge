import IORedis, { type Redis, type RedisOptions } from "ioredis";
import { env } from "@/lib/env";

let cached: Redis | null = null;

export function getRedis(): Redis {
  if (cached) return cached;
  const url = env().REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required for the job queue");

  const opts: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };

  cached = new IORedis(url, opts);
  return cached;
}
