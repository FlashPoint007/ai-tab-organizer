/** browser.tabs 的薄封装：统一 TabMeta 转换与查询口径。 */
import { browser } from 'wxt/browser';

import type { TabMeta } from '../types';

/**
 * 我们关心的浏览器 Tab 字段（结构化子集）。
 * 不直接引用 wxt/browser 的命名空间类型 —— 其回调式签名的交叉类型
 * （Promise<Tab> & void）在 await 后会坍缩，无法安全推断。
 */
export interface BrowserTab {
  id?: number;
  windowId: number;
  index: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  pinned: boolean;
  audible?: boolean;
  mutedInfo?: { muted: boolean };
  active: boolean;
  groupId?: number;
}

/** 浏览器 Tab 对象 -> 领域模型。 */
export function toTabMeta(tab: BrowserTab): TabMeta {
  return {
    id: tab.id ?? -1,
    windowId: tab.windowId,
    index: tab.index,
    title: tab.title ?? '',
    url: tab.url ?? '',
    favIconUrl: tab.favIconUrl || undefined,
    pinned: tab.pinned,
    audible: tab.audible ?? false,
    muted: tab.mutedInfo?.muted ?? false,
    active: tab.active,
    groupId: tab.groupId ?? -1,
  };
}

export async function getAllTabsMeta(): Promise<TabMeta[]> {
  const tabs = await browser.tabs.query({});
  return tabs.filter((t) => t.id != null).map(toTabMeta);
}

export async function getWindowTabsMeta(windowId?: number): Promise<TabMeta[]> {
  const tabs = await browser.tabs.query(
    windowId === undefined ? { windowType: 'normal' } : { windowId },
  );
  return tabs.filter((t) => t.id != null).map(toTabMeta);
}

/** Side Panel 场景取「当前」窗口的兜底实现：最后聚焦的普通窗口。 */
export async function getLastFocusedNormalWindowId(): Promise<number | undefined> {
  const win = await browser.windows.getLastFocused();
  return win.id;
}
