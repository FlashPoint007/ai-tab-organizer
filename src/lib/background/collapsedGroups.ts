/**
 * 折叠组瘦身：折叠时暂存标题并置空（Chrome 标签栏只显示色点），展开时还原。
 *
 * tabGroups.onUpdated 只传 TabGroup，没有 changeInfo；因此本模块自己记录上一帧 collapsed 状态。
 * 我们修改 title 也会再次触发 onUpdated，状态相同的事件会被忽略，避免递归。
 */
import { browser } from 'wxt/browser';

import { sessionKV } from '../storage/browserKv';
import type { KVStorage } from '../storage/kv';
import { applyCollapseTransition } from './collapsedGroupLogic';

export const COLLAPSED_TITLES_KEY = 'collapsedGroupTitles:v1';

async function readSavedTitles(kv: KVStorage): Promise<Record<number, string>> {
  return (await kv.get<Record<number, string>>(COLLAPSED_TITLES_KEY)) ?? {};
}

export function startCollapsedGroupManager(): void {
  const collapsedStates = new Map<number, boolean>();

  // 串行化读-改-写，避免同时折叠多个组时 session map 相互覆盖
  let operation = Promise.resolve();
  const enqueue = (task: () => Promise<void>): void => {
    operation = operation.then(task, task);
  };

  const processGroup = async (
    group: { id: number; collapsed: boolean; title?: string },
    force = false,
  ): Promise<void> => {
    const previous = collapsedStates.get(group.id);
    collapsedStates.set(group.id, group.collapsed);

    // title-only 更新（包括我们自己置空/还原 title 触发的事件）不再处理
    if (!force && previous !== undefined && previous === group.collapsed) return;

    try {
      // 重新读取，确保使用事件队列执行时的最新状态
      const current = await browser.tabGroups.get(group.id);
      collapsedStates.set(group.id, current.collapsed);

      const savedMap = await readSavedTitles(sessionKV);
      const transition = applyCollapseTransition({
        collapsing: current.collapsed,
        currentTitle: current.title ?? '',
        savedTitle: savedMap[group.id],
      });

      if (transition.save !== undefined) {
        await sessionKV.set(COLLAPSED_TITLES_KEY, {
          ...savedMap,
          [group.id]: transition.save,
        });
      } else if (transition.clearSaved) {
        const { [group.id]: _removed, ...rest } = savedMap;
        await sessionKV.set(COLLAPSED_TITLES_KEY, rest);
      }

      if ((current.title ?? '') !== transition.newTitle) {
        await browser.tabGroups.update(group.id, { title: transition.newTitle });
      }
    } catch (e) {
      // 组可能刚被关闭/解散
      collapsedStates.delete(group.id);
      console.info(
        '[ai-tab-organizer] collapse manager skipped:',
        e instanceof Error ? e.message : e,
      );
    }
  };

  // 冷启动：恢复状态；已经折叠但仍带标题的组也立即瘦身
  void browser.tabGroups
    .query({})
    .then((groups) => {
      for (const group of groups) {
        collapsedStates.set(group.id, group.collapsed);
        enqueue(() => processGroup(group, true));
      }
    })
    .catch(() => {});

  browser.tabGroups.onCreated.addListener((group) => {
    enqueue(() => processGroup(group, true));
  });

  browser.tabGroups.onUpdated.addListener((group) => {
    enqueue(() => processGroup(group));
  });

  browser.tabGroups.onRemoved.addListener((group) => {
    collapsedStates.delete(group.id);
    enqueue(async () => {
      const savedMap = await readSavedTitles(sessionKV);
      if (savedMap[group.id] === undefined) return;
      const { [group.id]: _removed, ...rest } = savedMap;
      await sessionKV.set(COLLAPSED_TITLES_KEY, rest);
    });
  });
}

/** 供实时归类/面板查询折叠组的原始名字（折叠期间 title 被置空）。 */
export async function getCollapsedTitles(
  kv: KVStorage = sessionKV,
): Promise<Record<number, string>> {
  return readSavedTitles(kv);
}
