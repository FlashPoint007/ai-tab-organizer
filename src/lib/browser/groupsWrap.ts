/** Chrome Tab Groups 操作封装。 */
import { browser } from 'wxt/browser';

import type { GroupColor } from '../organizer/grouping';

/**
 * chrome.tabs.group / tabGroups.update / tabs.ungroup 在类型定义里是
 * 「回调式签名」（返回 Promise<T> & void），直接调用会得到交叉类型。
 * 这里用本地 shim 固化为纯 Promise 形态。
 */
type GroupFn = (options: {
  tabIds: number[];
  createProperties: { windowId: number };
}) => Promise<number>;
type UpdateGroupFn = (
  groupId: number,
  updateProperties: { title?: string; color?: string; collapsed?: boolean },
) => Promise<unknown>;
type UngroupFn = (tabIds: number[]) => Promise<void>;

const groupAsPromise = browser.tabs.group as unknown as GroupFn;
const updateGroupAsPromise = browser.tabGroups.update as unknown as UpdateGroupFn;
const ungroupByIds = browser.tabs.ungroup as unknown as UngroupFn;

export interface GroupStyle {
  title: string;
  color?: GroupColor;
  collapsed?: boolean;
}

/** 把一组标签建成 Chrome 标签组，返回新组 id。 */
export async function createTabGroup(
  windowId: number,
  tabIds: number[],
  style: GroupStyle,
): Promise<number> {
  if (tabIds.length === 0) throw new Error('不能创建空标签组');
  const groupId = await groupAsPromise({ tabIds, createProperties: { windowId } });
  await updateGroupAsPromise(groupId, {
    title: style.title,
    ...(style.color ? { color: style.color } : {}),
    ...(style.collapsed === undefined ? {} : { collapsed: style.collapsed }),
  });
  return groupId;
}

/** 取消一组标签的分组。 */
export async function ungroupTabs(tabIds: number[]): Promise<void> {
  if (tabIds.length > 0) await ungroupByIds(tabIds);
}

/** 把窗口内所有未固定、已分组的标签移出分组（重新分组前清场用）。 */
export async function ungroupAllUngroupedTabsInWindow(windowId: number): Promise<void> {
  const tabs = await browser.tabs.query({ windowId });
  const groupedIds = tabs
    .filter((t) => t.id != null && !t.pinned && t.groupId !== -1)
    .map((t) => t.id as number);
  await ungroupTabs(groupedIds);
}
