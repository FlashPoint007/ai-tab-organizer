/**
 * 分类缓存：URL 归一化哈希 -> 类别，带 TTL。
 *
 * M3 的 LLM 结果将写入这里，避免同一页面重复消耗 token；
 * 规则结果不缓存（本地计算零成本且需要即时反映规则编辑）。
 */
import type { KVStorage } from './kv';

const CACHE_KEY = 'categoryCache:v1';

/** 默认 TTL：14 天。 */
export const CATEGORY_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export interface CategoryCacheEntry {
  /** 类别 */
  c: string;
  /** 写入时间戳 ms */
  t: number;
}

type CacheMap = Record<string, CategoryCacheEntry>;

async function readAll(kv: KVStorage): Promise<CacheMap> {
  return (await kv.get<CacheMap>(CACHE_KEY)) ?? {};
}

async function writeAll(kv: KVStorage, map: CacheMap): Promise<void> {
  await kv.set(CACHE_KEY, map);
}

export async function getCachedCategory(
  kv: KVStorage,
  cacheKey: string,
  now: number,
  ttlMs: number = CATEGORY_CACHE_TTL_MS,
): Promise<string | undefined> {
  if (!cacheKey) return undefined;
  const map = await readAll(kv);
  const entry = map[cacheKey];
  if (!entry) return undefined;
  if (now - entry.t > ttlMs) return undefined; // 过期视为未命中
  return entry.c;
}

export async function putCachedCategory(
  kv: KVStorage,
  cacheKey: string,
  category: string,
  now: number,
): Promise<void> {
  if (!cacheKey || !category) return;
  const map = await readAll(kv);
  map[cacheKey] = { c: category, t: now };
  await writeAll(kv, map);
}

/** 清理全部过期条目，返回剩余数量。 */
export async function pruneExpiredCategories(
  kv: KVStorage,
  now: number,
  ttlMs: number = CATEGORY_CACHE_TTL_MS,
): Promise<number> {
  const map = await readAll(kv);
  let kept = 0;
  for (const key of Object.keys(map)) {
    const entry = map[key];
    if (entry && now - entry.t <= ttlMs) kept += 1;
    else delete map[key];
  }
  await writeAll(kv, map);
  return kept;
}

/** 清空缓存（用户手动刷新分类时用）。 */
export async function clearCategoryCache(kv: KVStorage): Promise<void> {
  await writeAll(kv, {});
}
