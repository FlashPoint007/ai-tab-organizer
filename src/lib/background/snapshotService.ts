/** 快照服务：清理前自动存档，支持恢复（跳过已打开的页面）。 */
import { getWindowTabsMeta } from '../browser/tabsWrap';
import { localKV } from '../storage/browserKv';
import type { KVStorage } from '../storage/kv';
import { normalizeUrlForCache } from '../../utils/url';
import type { Snapshot, SnapshotReason, SnapshotTab } from '../types';

const SNAPSHOTS_KEY = 'snapshots:v1';
const MAX_SNAPSHOTS = 10;

let kv: KVStorage = localKV;

/** 测试注入点。 */
export function setSnapshotKVForTests(storage: KVStorage): void {
  kv = storage;
}

function newSnapshotId(): string {
  // Web Crypto：Node(vitest) 与 MV3 Service Worker 均可用
  return crypto.randomUUID();
}

async function readAll(): Promise<Snapshot[]> {
  return (await kv.get<Snapshot[]>(SNAPSHOTS_KEY)) ?? [];
}

async function writeAll(snapshots: Snapshot[]): Promise<void> {
  // 超出上限时丢弃最旧的
  const trimmed = [...snapshots].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_SNAPSHOTS);
  await kv.set(SNAPSHOTS_KEY, trimmed);
}

export async function createSnapshot(
  reason: SnapshotReason,
  label?: string,
  tabs?: SnapshotTab[],
): Promise<Snapshot> {
  const source =
    tabs ??
    (await getWindowTabsMeta())
      .filter((t) => normalizeUrlForCache(t.url) !== '')
      .map((t) => ({ title: t.title, url: t.url, pinned: t.pinned }));

  const snapshot: Snapshot = {
    id: newSnapshotId(),
    createdAt: Date.now(),
    label: label ?? defaultLabel(reason),
    reason,
    tabs: source,
  };
  await writeAll([snapshot, ...(await readAll())]);
  return snapshot;
}

function defaultLabel(reason: SnapshotReason): string {
  const time = new Date().toLocaleString('zh-CN', { hour12: false });
  if (reason === 'cleanup-duplicates') return `清理重复页面前 · ${time}`;
  if (reason === 'cleanup-inactive') return `清理非活跃页面前 · ${time}`;
  return `手动快照 · ${time}`;
}

export interface SnapshotSummary {
  id: string;
  createdAt: number;
  label: string;
  reason: string;
  count: number;
}

export async function listSnapshots(): Promise<SnapshotSummary[]> {
  return (await readAll())
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(({ id, createdAt, label, reason, tabs }) => ({ id, createdAt, label, reason, count: tabs.length }));
}

export async function deleteSnapshot(id: string): Promise<void> {
  await writeAll((await readAll()).filter((s) => s.id !== id));
}

export interface RestorePlan {
  toOpen: SnapshotTab[];
  skipped: number;
}

/** 纯函数：恢复计划 —— 归一化 URL 已存在的条目跳过。 */
export function planRestore(existingUrls: string[], snapshotTabs: SnapshotTab[]): RestorePlan {
  const existing = new Set(existingUrls.map((u) => normalizeUrlForCache(u)).filter((u) => u !== ''));
  const toOpen: SnapshotTab[] = [];
  let skipped = 0;
  for (const tab of snapshotTabs) {
    const key = normalizeUrlForCache(tab.url);
    if (key && existing.has(key)) {
      skipped += 1;
      continue;
    }
    toOpen.push(tab);
    if (key) existing.add(key);
  }
  return { toOpen, skipped };
}

export async function getSnapshot(id: string): Promise<Snapshot | undefined> {
  return (await readAll()).find((s) => s.id === id);
}
