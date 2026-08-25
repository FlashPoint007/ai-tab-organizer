/**
 * AI 分类管线（M3/M4）：
 * - computeOrganizePlan：过滤→缓存→批量LLM→解析写回→失败批次回落规则，产出「分类方案」
 * - applyCategoryPlan：清场旧组后按方案建组
 * - organizeTabsByLlm：两段连跑（自动触发器/跳过预览时使用）
 */
import { createLlmClient, LlmError } from '../llm/client';
import { buildClassifyMessages } from '../llm/prompts';
import { parseAssignments } from '../llm/parser';
import { applyRules, colorForCategory, computeCategoryGroups } from '../organizer/rules';
import { isWebUrl } from '../organizer/domains';
import { createTabGroup, ungroupAllUngroupedTabsInWindow } from '../browser/groupsWrap';
import { getWindowTabsMeta } from '../browser/tabsWrap';
import { loadSettings } from '../settings/settingsStore';
import { localKV } from '../storage/browserKv';
import type { KVStorage } from '../storage/kv';
import {
  CATEGORY_CACHE_TTL_MS,
  getCachedCategory,
  putCachedCategory,
} from '../storage/categoryCache';
import { cacheKeyFor } from '../../utils/url';
import type { TabMeta } from '../types';
import type {
  LlmUsageStats,
  OrganizePlan,
  OrganizePlanStats,
} from '../messaging/protocol';

const USAGE_KEY = 'llmUsage:v1';

async function readUsage(kv: KVStorage): Promise<LlmUsageStats> {
  return (
    (await kv.get<LlmUsageStats>(USAGE_KEY)) ?? {
      requests: 0,
      totalTokens: 0,
      degradedBatches: 0,
    }
  );
}

export async function getLlmUsage(kv: KVStorage = localKV): Promise<LlmUsageStats> {
  return readUsage(kv);
}

export async function clearLlmUsage(kv: KVStorage = localKV): Promise<void> {
  await kv.set(USAGE_KEY, { requests: 0, totalTokens: 0, degradedBatches: 0 });
}

async function bumpUsage(
  delta: { requests: number; totalTokens: number; degradedBatches: number },
  kv: KVStorage,
): Promise<void> {
  const current = await readUsage(kv);
  await kv.set(USAGE_KEY, {
    requests: current.requests + delta.requests,
    totalTokens: current.totalTokens + delta.totalTokens,
    degradedBatches: current.degradedBatches + delta.degradedBatches,
    lastRunAt: Date.now(),
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** 抛错文案给 UI 直接展示。 */
export function describeLlmError(e: unknown): string {
  if (e instanceof LlmError) {
    if (/HTTP 401|HTTP 403/.test(e.message)) return '鉴权失败：请检查 API Key 是否正确';
    if (/HTTP 429/.test(e.message)) return '请求过于频繁或额度不足（429）';
    if (/网络请求失败/.test(e.message)) return '无法连接到模型服务：' + e.message;
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

/** 阶段一：只算方案，不动浏览器分组。 */
export async function computeOrganizePlan(windowId: number): Promise<OrganizePlan> {
  const settings = await loadSettings(localKV);
  const config = settings.llm;
  if (!config || !config.baseUrl || !config.model) {
    throw new Error('尚未配置 AI 模型：请打开扩展设置页，选择 Provider 并填写 Key');
  }

  const client = createLlmClient(config);
  const allTabs = await getWindowTabsMeta(windowId);
  const candidates = allTabs.filter((t) => isWebUrl(t.url));
  const skippedInternal = allTabs.length - candidates.length;

  // ---- 第一遍：缓存命中 ----
  const assignments = new Map<number, string>();
  const misses: TabMeta[] = [];
  let cacheHits = 0;
  const now = Date.now();
  for (const tab of candidates) {
    const key = await cacheKeyFor(tab.url);
    const cached = key ? await getCachedCategory(localKV, key, now, CATEGORY_CACHE_TTL_MS) : undefined;
    if (cached && settings.categories.includes(cached)) {
      assignments.set(tab.id, cached);
      cacheHits += 1;
    } else {
      misses.push(tab);
    }
  }

  // ---- 第二遍：批量并发调 LLM；单批失败降级规则 ----
  const validCategories = new Set(settings.categories);
  let requests = 0;
  let totalTokens = 0;
  let batchesFailed = 0;
  let llmAssigned = 0;
  const ruleFallbackIds = new Set<number>();

  const batchSize = Math.max(1, settings.llmBatch.size);
  const concurrency = Math.max(1, settings.llmBatch.concurrency);
  const chunks = chunk(misses, batchSize);

  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < chunks.length) {
      const mine = chunks[cursor];
      cursor += 1;
      if (!mine) return;

      try {
        const result = await client.chat(
          buildClassifyMessages(
            settings.categories,
            mine.map((t) => ({ id: t.id, title: t.title, url: t.url })),
          ),
          { timeoutMs: settings.llmBatch.timeoutMs },
        );
        requests += 1;
        totalTokens += result.usage?.totalTokens ?? 0;

        const parsed = parseAssignments(result.content, new Set(mine.map((t) => t.id)), validCategories);
        for (const a of parsed) {
          assignments.set(a.id, a.category);
          llmAssigned += 1;
          const source = mine.find((t) => t.id === a.id);
          if (source) {
            const key = await cacheKeyFor(source.url);
            if (key) await putCachedCategory(localKV, key, a.category, Date.now());
          }
        }
      } catch {
        batchesFailed += 1;
        for (const t of mine) ruleFallbackIds.add(t.id);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(chunks.length, 1)) }, () => worker()));

  // ---- 规则兜底 ----
  let ruleFallback = 0;
  if (ruleFallbackIds.size > 0) {
    const fallbackTabs = allTabs.filter((t) => ruleFallbackIds.has(t.id));
    for (const [id, category] of applyRules(fallbackTabs, settings.rules)) {
      if (!assignments.has(id)) {
        assignments.set(id, category);
        ruleFallback += 1;
      }
    }
  }

  const stats: OrganizePlanStats = {
    llmAssigned,
    cacheHits,
    ruleFallback,
    skippedInternal,
    batchesFailed,
    requests,
    totalTokens,
    candidates: candidates.length,
  };

  await bumpUsage({ requests, totalTokens, degradedBatches: batchesFailed }, localKV);

  return {
    stats,
    assignments: [...assignments.entries()].map(([tabId, category]) => ({ tabId, category })),
  };
}

/** 阶段二：把方案落到 Chrome 标签组。 */
export async function applyCategoryPlan(
  windowId: number,
  assignments: Array<{ tabId: number; category: string }>,
): Promise<{ groups: number; groupedTabs: number }> {
  const settings = await loadSettings(localKV);
  const allTabs = await getWindowTabsMeta(windowId);
  const assignmentMap = new Map(assignments.map((a) => [a.tabId, a.category]));

  await ungroupAllUngroupedTabsInWindow(windowId);
  const groups = computeCategoryGroups(allTabs, assignmentMap, settings.minGroupSizeForRules);
  let groupedTabs = 0;
  for (const group of groups) {
    await createTabGroup(windowId, group.tabIds, {
      title: group.category,
      color: colorForCategory(group.category),
      collapsed: false,
    });
    groupedTabs += group.tabIds.length;
  }
  return { groups: groups.length, groupedTabs };
}

/** 两段连跑：自动触发器与「跳过预览」路径使用。 */
export async function organizeTabsByLlm(
  windowId: number,
): Promise<OrganizePlan & { groups: number; groupedTabs: number }> {
  const plan = await computeOrganizePlan(windowId);
  const applied = await applyCategoryPlan(windowId, plan.assignments);
  return { ...plan, ...applied };
}
