import { describe, expect, it } from 'vitest';

import { MemoryKV } from './kv';
import {
  CATEGORY_CACHE_TTL_MS,
  clearCategoryCache,
  getCachedCategory,
  putCachedCategory,
  pruneExpiredCategories,
} from './categoryCache';

const NOW = 1_700_000_000_000;

describe('categoryCache', () => {
  it('写入后命中，key 缺失未命中', async () => {
    const kv = new MemoryKV();
    await putCachedCategory(kv, 'k1', '开发工具', NOW);
    expect(await getCachedCategory(kv, 'k1', NOW)).toBe('开发工具');
    expect(await getCachedCategory(kv, 'missing', NOW)).toBeUndefined();
  });

  it('超过 TTL 视为未命中', async () => {
    const kv = new MemoryKV();
    await putCachedCategory(kv, 'k1', '开发工具', NOW);
    expect(await getCachedCategory(kv, 'k1', NOW + CATEGORY_CACHE_TTL_MS + 1)).toBeUndefined();
    expect(await getCachedCategory(kv, 'k1', NOW + CATEGORY_CACHE_TTL_MS - 1)).toBe('开发工具');
  });

  it('prune 只清过期条目并返回剩余数量', async () => {
    const kv = new MemoryKV();
    await putCachedCategory(kv, 'fresh', 'A', NOW - 1000);
    await putCachedCategory(kv, 'stale', 'B', NOW - CATEGORY_CACHE_TTL_MS - 1000);
    expect(await pruneExpiredCategories(kv, NOW)).toBe(1);
    expect(await getCachedCategory(kv, 'fresh', NOW)).toBe('A');
    expect(await getCachedCategory(kv, 'stale', NOW)).toBeUndefined();
  });

  it('clear 清空全部；非法输入被忽略', async () => {
    const kv = new MemoryKV();
    await putCachedCategory(kv, 'k', 'A', NOW);
    await clearCategoryCache(kv);
    expect(await getCachedCategory(kv, 'k', NOW)).toBeUndefined();
    await putCachedCategory(kv, '', 'A', NOW); // 不应抛错也不应生效
    expect(Object.keys((await kv.get('categoryCache:v2')) as object)).toHaveLength(0);
  });
});
