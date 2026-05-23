import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/**
 * Acquire a distributed lock. Returns true if the lock was acquired.
 * Uses SET NX EX — atomic, no race on acquire + expire.
 */
export async function acquireLock(
  key: string,
  ttlSeconds: number = 10
): Promise<boolean> {
  const result = await redis.set(key, "1", {
    nx: true,
    ex: ttlSeconds,
  });
  return result === "OK";
}

export async function releaseLock(key: string): Promise<void> {
  await redis.del(key);
}

export function inventoryLockKey(productId: string, warehouseId: string) {
  return `lock:inventory:${productId}:${warehouseId}`;
}
