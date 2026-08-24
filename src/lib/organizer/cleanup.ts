import { normalizeUrlForCache } from '../../utils/url';
import type { TabMeta } from '../types';
import { isWebUrl } from './domains';

export interface DuplicateCluster {
  /** 保留的标签 */
  keepTabId: number;
  /** 与保留页 URL 相同、将被关闭的标签 */
  removeTabIds: number[];
}

/** 把所有簇的待关闭标签汇总成一个去重后的 id 列表。 */
export function cleanupCandidatesFromClusters(clusters: DuplicateCluster[]): number[] {
  return [...new Set(clusters.flatMap((cluster) => cluster.removeTabIds))];
}

const KEEP_PRIORITY_ACTIVE = 0;
const KEEP_PRIORITY_PINNED = 1;
const KEEP_PRIORITY_DEFAULT = 2;

function keepPriority(tab: TabMeta): number {
  if (tab.active) return KEEP_PRIORITY_ACTIVE;
  if (tab.pinned) return KEEP_PRIORITY_PINNED;
  return KEEP_PRIORITY_DEFAULT;
}

/**
 * 找出重复 URL 的标签簇（归一化后同 URL 视为重复）。
 * 每簇保留一个：优先保留激活页 > 固定页 > 更早打开的页；其余为待关闭候选。
 */
export function findDuplicateTabs(tabs: TabMeta[]): DuplicateCluster[] {
  const clusters = new Map<string, TabMeta[]>();

  for (const tab of tabs) {
    if (!isWebUrl(tab.url)) continue;
    const key = normalizeUrlForCache(tab.url);
    if (!key) continue;
    const bucket = clusters.get(key);
    if (bucket) bucket.push(tab);
    else clusters.set(key, [tab]);
  }

  const result: DuplicateCluster[] = [];
  for (const group of clusters.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => {
      const p = keepPriority(a) - keepPriority(b);
      return p !== 0 ? p : a.index - b.index;
    });
    const keep = sorted[0];
    if (!keep) continue;
    result.push({
      keepTabId: keep.id,
      removeTabIds: sorted.slice(1).map((t) => t.id),
    });
  }
  return result;
}

/**
 * 「非活跃」标签候选：未激活、未固定、未播放音频的普通网页。
 * 内部页（chrome:// 等）一律跳过。
 */
export function findInactiveTabs(tabs: TabMeta[]): number[] {
  return tabs
    .filter((tab) => !tab.active && !tab.pinned && !tab.audible && isWebUrl(tab.url))
    .map((tab) => tab.id);
}
