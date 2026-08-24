/**
 * TabRegistry：全量标签的内存注册表。
 *
 * - SW 冷启动时先用 chrome.storage.session 里上次的数据热身，再和实时查询对账
 * - 事件驱动增量更新；变更后防抖持久化
 */
import { getAllTabsMeta } from '../browser/tabsWrap';
import { sessionKV } from '../storage/browserKv';
import type { KVStorage } from '../storage/kv';
import type { TabMeta } from '../types';
import { debounce } from '../../utils/debounce';
import { toTabMeta } from '../browser/tabsWrap';
import type { BrowserTab } from '../browser/tabsWrap';

const REGISTRY_KEY = 'tabRegistry:v1';

let registry = new Map<number, TabMeta>();
let kv: KVStorage = sessionKV;
let loaded = false;

/** 纯函数：以实时数据为准合并持久化数据（保留实时里没有的窗口信息无意义，直接覆盖）。 */
export function reconcileRegistry(persisted: TabMeta[], live: TabMeta[]): TabMeta[] {
  void persisted;
  return live;
}

/** 测试注入点：替换存储后端。 */
export function setRegistryKVForTests(storage: KVStorage): void {
  kv = storage;
  loaded = false;
  registry = new Map();
}

export async function ensureRegistryLoaded(): Promise<void> {
  if (loaded) return;
  const persisted = (await kv.get<TabMeta[]>(REGISTRY_KEY)) ?? [];
  for (const meta of persisted) registry.set(meta.id, meta);

  const live = await getAllTabsMeta();
  const merged = reconcileRegistry([...registry.values()], live);
  registry = new Map(merged.map((t) => [t.id, t]));
  loaded = true;
  void persistRegistry();
}

export function getRegistrySnapshot(): TabMeta[] {
  return [...registry.values()];
}

export function getTabsForWindow(windowId: number): TabMeta[] {
  return [...registry.values()].filter((t) => t.windowId === windowId).sort((a, b) => a.index - b.index);
}

export function upsertTab(meta: TabMeta): void {
  registry.set(meta.id, meta);
}

export function upsertFromBrowserTab(tab: BrowserTab): void {
  if (tab.id == null) return;
  registry.set(tab.id, toTabMeta(tab));
}

export function removeTab(tabId: number): void {
  registry.delete(tabId);
}

/** 用一次实时查询整体刷新某窗口的条目（移动/附加等索引类事件最省心）。 */
export async function replaceWindowEntries(windowId: number, tabs: TabMeta[]): Promise<void> {
  for (const [id, meta] of registry) {
    if (meta.windowId === windowId && !tabs.some((t) => t.id === id)) registry.delete(id);
  }
  for (const meta of tabs) registry.set(meta.id, meta);
}

const persistRegistry = debounce((): void => {
  void kv.set(REGISTRY_KEY, [...registry.values()]);
}, 400);

export function schedulePersist(): void {
  persistRegistry();
}
