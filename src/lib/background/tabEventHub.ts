/**
 * TabEventHub：把浏览器标签事件接到 TabRegistry，并防抖广播给扩展页面。
 */
import { browser } from 'wxt/browser';

import type { Event } from '../messaging/protocol';
import { getWindowTabsMeta } from '../browser/tabsWrap';
import {
  ensureRegistryLoaded,
  getTabsForWindow,
  removeTab,
  replaceWindowEntries,
  schedulePersist,
  upsertFromBrowserTab,
} from './tabRegistry';

export type BroadcastFn = (event: Event) => void;

/** 广播封装：没有接收方（如面板未开）时 sendMessage 会 reject，静默即可。 */
export function safeBroadcast(event: Event): void {
  void browser.runtime.sendMessage(event).catch(() => {});
}

const BROADCAST_DEBOUNCE_MS = 120;

export function startEventHub(broadcast: BroadcastFn = safeBroadcast): void {
  const pushWindow = debounceBroadcast((windowId: number) => {
    broadcast({ type: 'tabsUpdated', windowId, tabs: getTabsForWindow(windowId) });
  });

  // 索引移动 / 跨窗 / 分组变化等「算不准」的场景：直接以一次实时查询对账该窗口
  const refreshWindow = debounceWindowRefresh(async (windowId) => {
    await replaceWindowEntries(windowId, await getWindowTabsMeta(windowId));
    schedulePersist();
    pushWindow(windowId);
  });

  browser.tabs.onCreated.addListener((tab) => {
    upsertFromBrowserTab(tab);
    schedulePersist();
    pushWindow(tab.windowId);
  });

  browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    const relevant =
      changeInfo.url !== undefined ||
      changeInfo.title !== undefined ||
      changeInfo.pinned !== undefined ||
      changeInfo.audible !== undefined ||
      changeInfo.mutedInfo !== undefined ||
      changeInfo.groupId !== undefined ||
      changeInfo.status === 'complete';
    if (!relevant) return;
    upsertFromBrowserTab(tab);
    schedulePersist();
    pushWindow(tab.windowId);
  });

  browser.tabs.onRemoved.addListener((tabId, info) => {
    removeTab(tabId);
    schedulePersist();
    pushWindow(info.windowId);
  });

  browser.tabs.onReplaced.addListener((_addedId, removedId) => {
    removeTab(removedId);
    schedulePersist();
    void refreshAllWindows(broadcast);
  });

  browser.tabs.onMoved.addListener((_tabId, info) => refreshWindow(info.windowId));
  browser.tabs.onAttached.addListener((_tabId, info) => {
    refreshWindow(info.newWindowId);
  });
  browser.tabs.onDetached.addListener((_tabId, info) => refreshWindow(info.oldWindowId));

  // 分组变化影响 groupId 字段，统一全量对账
  for (const eventName of ['onCreated', 'onUpdated', 'onRemoved'] as const) {
    browser.tabGroups?.[eventName]?.addListener(() => void refreshAllWindows(broadcast));
  }

  void ensureRegistryLoaded().then(() => void refreshAllWindows(broadcast));
}

// ---------- 内部工具（防抖实例在 startEventHub 每次调用时新建） ----------

function debounceBroadcast(push: (windowId: number) => void): (windowId: number) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = new Set<number>();
  return (windowId: number) => {
    pending.add(windowId);
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      const ids = [...pending];
      pending.clear();
      for (const id of ids) push(id);
    }, BROADCAST_DEBOUNCE_MS);
  };
}

function debounceWindowRefresh(fn: (windowId: number) => Promise<void>): (windowId: number) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = new Set<number>();
  return (windowId: number) => {
    pending.add(windowId);
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      const ids = [...pending];
      pending.clear();
      for (const id of ids) void fn(id);
    }, 50);
  };
}

let refreshingAll = false;
async function refreshAllWindows(broadcast: BroadcastFn): Promise<void> {
  if (refreshingAll) return;
  refreshingAll = true;
  try {
    const all = await getWindowTabsMeta();
    const byWindow = new Map<number, TabMetaList>();
    for (const meta of all) {
      const bucket = byWindow.get(meta.windowId);
      if (bucket) bucket.push(meta);
      else byWindow.set(meta.windowId, [meta]);
    }
    for (const [windowId, tabs] of byWindow) {
      await replaceWindowEntries(windowId, tabs);
      broadcast({ type: 'tabsUpdated', windowId, tabs });
    }
    schedulePersist();
  } finally {
    refreshingAll = false;
  }
}

type TabMetaList = ReturnType<typeof getWindowTabsMeta> extends Promise<infer T> ? T : never;
