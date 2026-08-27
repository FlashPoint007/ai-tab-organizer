/**
 * 折叠组标题管理：按 settings.collapsedTitleMode 决定折叠时的 title。
 *
 * Chrome 折叠组的 chip 宽度与 hover tooltip 共用同一个 title 字段，因此三档取舍：
 * hide=只剩色点（hover 显示「未命名的组」）｜abbreviate=缩写（窄 chip + hover 可辨识）｜keep=全名
 *
 * tabGroups.onUpdated 只传 TabGroup，没有 changeInfo；因此本模块自己记录上一帧 collapsed 状态。
 * 我们修改 title 也会再次触发 onUpdated，状态相同的事件会被忽略，避免递归。
 */
import { browser } from 'wxt/browser';

import { loadSettings } from '../settings/settingsStore';
import { localKV, sessionKV } from '../storage/browserKv';
import type { KVStorage } from '../storage/kv';
import { applyCollapseTransition } from './collapsedGroupLogic';
import type { SavedTitle } from './collapsedGroupLogic';

/** v2：值从 string 升级为 {full, short}，需要区分「我们写的缩写」与「用户改的名」。 */
export const COLLAPSED_TITLES_KEY = 'collapsedGroupTitles:v2';

async function readSavedTitles(kv: KVStorage): Promise<Record<number, SavedTitle>> {
  return (await kv.get<Record<number, SavedTitle>>(COLLAPSED_TITLES_KEY)) ?? {};
}

/** 供实时归类/面板查询折叠组的原始名字（折叠期间 title 可能被缩写或清空）。 */
export async function getCollapsedTitles(
  kv: KVStorage = sessionKV,
): Promise<Record<number, SavedTitle>> {
  return readSavedTitles(kv);
}

const collapsedStates = new Map<number, boolean>();

// 串行化读-改-写，避免同时折叠多个组时 session map 相互覆盖
let operation = Promise.resolve();
function enqueue(task: () => Promise<void>): void {
  operation = operation.then(task, task);
}

async function processGroup(
  group: { id: number; collapsed: boolean; title?: string },
  force = false,
): Promise<void> {
  const previous = collapsedStates.get(group.id);
  collapsedStates.set(group.id, group.collapsed);

  // title-only 更新（包括我们自己改写 title 触发的事件）不再处理
  if (!force && previous !== undefined && previous === group.collapsed) return;

  try {
    // 重新读取，确保使用事件队列执行时的最新状态
    const current = await browser.tabGroups.get(group.id);
    collapsedStates.set(group.id, current.collapsed);

    const settings = await loadSettings(localKV);
    const savedMap = await readSavedTitles(sessionKV);
    const transition = applyCollapseTransition({
      collapsing: current.collapsed,
      currentTitle: current.title ?? '',
      saved: savedMap[group.id],
      mode: settings.collapsedTitleMode,
    });

    if (transition.save !== undefined) {
      await sessionKV.set(COLLAPSED_TITLES_KEY, { ...savedMap, [group.id]: transition.save });
    } else if (transition.clearSaved && savedMap[group.id] !== undefined) {
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
}

/** 设置里切换 collapsedTitleMode 后立即重刷全部组，不必等下一次折叠。 */
export async function reapplyCollapsedTitles(): Promise<void> {
  const groups = await browser.tabGroups.query({}).catch(() => []);
  for (const group of groups) {
    enqueue(() => processGroup(group, true));
  }
  await operation;
}

/** 注册折叠标题管理。SW 每次冷启动调用一次。 */
export function startCollapsedGroupManager(): void {
  // 冷启动对账：已折叠但仍带全名的组立即按当前策略处理
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
