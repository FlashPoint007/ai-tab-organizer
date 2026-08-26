/**
 * 单标签实时归类（M6）：
 * 标签加载完成（status=complete）后 2 秒，按 缓存 → 规则 → 单条 LLM 的顺序
 * 求类别，然后并入同名标签组（没有就建组）。
 *
 * 设计约束：
 * - 只处理未分组、非固定的 http(s) 标签；用户手动分组的不碰
 * - LLM 未配置时静默跳过（只走缓存/规则）
 * - 所有失败静默，绝不打扰用户
 */
import { browser } from 'wxt/browser';

import { createLlmClient } from '../llm/client';
import { buildAdaptiveClassifyMessages } from '../llm/prompts';
import { parseAdaptiveResult } from '../llm/parser';
import { applyRules, colorForCategory } from '../organizer/rules';
import { isWebUrl } from '../organizer/domains';
import { createTabGroup } from '../browser/groupsWrap';
import { loadSettings, saveSettings } from '../settings/settingsStore';
import { localKV, sessionKV } from '../storage/browserKv';
import { getCollapsedTitles } from './collapsedGroups';
import { findGroupIdForCategory } from './collapsedGroupLogic';
import { getCachedCategory, putCachedCategory, CATEGORY_CACHE_TTL_MS } from '../storage/categoryCache';
import { cacheKeyFor } from '../../utils/url';
import type { Settings } from '../settings/types';
import type { TabMeta } from '../types';

const PROCESS_DELAY_MS = 2_000;

/** 纯函数：按优先级（缓存 → 规则 → LLM）取第一个有效类别。 */
export function resolveRealtimeCategory(params: {
  cached?: string;
  rule?: string;
  llm?: string;
  knownCategories: readonly string[];
}): string | undefined {
  const known = new Set(params.knownCategories);
  for (const candidate of [params.cached, params.rule, params.llm]) {
    if (candidate && known.has(candidate)) return candidate;
  }
  return undefined;
}

function toLightMeta(tab: { id?: number; title?: string; url?: string }): TabMeta {
  return {
    id: tab.id ?? -1,
    windowId: 0,
    index: 0,
    title: tab.title ?? '',
    url: tab.url ?? '',
    pinned: false,
    audible: false,
    muted: false,
    active: false,
    groupId: -1,
  };
}

const pending = new Set<number>();
let timer: ReturnType<typeof setTimeout> | undefined = undefined;

function schedule(tabId: number | undefined): void {
  if (tabId === undefined || tabId < 0) return;
  pending.add(tabId);
  if (timer !== undefined) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void processPending();
  }, PROCESS_DELAY_MS);
}

async function processPending(): Promise<void> {
  const ids = [...pending];
  pending.clear();
  const settings = await loadSettings(localKV);
  if (!settings.realtime) return;

  for (const id of ids) {
    try {
      await classifyOne(id, settings);
    } catch (e) {
      console.info('[ai-tab-organizer] realtime classify skipped:', e instanceof Error ? e.message : e);
    }
  }
}

async function classifyOne(tabId: number, settings: Settings): Promise<void> {
  let tab: { id?: number; windowId?: number; url?: string; title?: string; pinned?: boolean; groupId?: number };
  try {
    tab = await browser.tabs.get(tabId);
  } catch {
    return; // 已被关闭
  }
  if (
    tab.id === undefined ||
    !tab.url ||
    !isWebUrl(tab.url) ||
    tab.pinned === true ||
    (tab.groupId !== undefined && tab.groupId !== -1) ||
    tab.windowId === undefined
  ) {
    return;
  }

  const key = await cacheKeyFor(tab.url);
  const cached = key ? await getCachedCategory(localKV, key, Date.now(), CATEGORY_CACHE_TTL_MS) : undefined;

  const meta = toLightMeta(tab);
  const ruleHit = applyRules([meta], settings.rules).get(tabId);

  let llmCategory: string | undefined;
  if (!cached && !ruleHit && settings.llm) {
    const client = createLlmClient(settings.llm);
    const result = await client.chat(
      buildAdaptiveClassifyMessages([{ id: tabId, title: tab.title ?? '', url: tab.url }], settings.categories),
      { timeoutMs: settings.llmBatch.timeoutMs, retries: 1 },
    );
    const adaptive = parseAdaptiveResult(result.content, new Set([tabId]));
    const first = adaptive.assignments[0]?.category;
    if (first) {
      llmCategory = first;
      // 新类别并入清单 + 写缓存
      if (!settings.categories.includes(first)) {
        settings.categories = [...settings.categories, first];
        await saveSettings(settings, localKV);
      }
      if (key) await putCachedCategory(localKV, key, first, Date.now());
    }
  }

  const category = resolveRealtimeCategory({
    cached,
    rule: ruleHit,
    llm: llmCategory,
    knownCategories: settings.categories,
  });
  if (!category) return;

  await placeInGroup(tab.id, tab.windowId, category);
}

async function placeInGroup(tabId: number, windowId: number, category: string): Promise<void> {
  // 找同名组就并入，否则建新组（配色由类别名哈希决定，跨会话稳定）
  // 折叠组的 title 被置空以节省标签栏空间，真名在 session 暂存表里，
  // 必须按「实际名字」匹配，否则会给同一类别重复建组。
  const groups = await browser.tabGroups.query({ windowId }).catch(() => []);
  const savedTitles = await getCollapsedTitles(sessionKV);
  const targetId = findGroupIdForCategory(
    groups.map((g) => ({ id: g.id, title: g.title })),
    savedTitles,
    category,
  );
  if (targetId !== undefined) {
    await browser.tabs.group({ tabIds: [tabId], groupId: targetId });
    return;
  }
  await createTabGroup(windowId, [tabId], {
    title: category,
    color: colorForCategory(category),
    collapsed: false,
  });
}

/** 注册实时归类监听。SW 每次冷启动调用一次。 */
export function startRealtimeClassifier(): void {
  browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete') return;
    if (!isWebUrl(tab.url ?? '')) return;
    schedule(tab.id);
  });
}
