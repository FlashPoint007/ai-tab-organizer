/**
 * 类型化消息协议。
 *
 * - Request：Side Panel / Options → Background（runtime.sendMessage，等待回包）
 * - Event：Background → 所有扩展页面（广播，无回包）
 *
 * 所有载荷用 zod 校验：跨信任边界的数据一律先过 schema 再使用。
 */
import { z } from 'zod';

import type { DomainRule } from '../settings/types';

export const tabMetaSchema = z.object({
  id: z.number(),
  windowId: z.number(),
  index: z.number(),
  title: z.string(),
  url: z.string(),
  favIconUrl: z.string().optional(),
  pinned: z.boolean(),
  audible: z.boolean(),
  muted: z.boolean(),
  active: z.boolean(),
  groupId: z.number(),
});

export type TabMetaMessage = z.infer<typeof tabMetaSchema>;

// ---------- Panel -> Background ----------

const tabIdsField = z.array(z.number().int()).min(1);

export const ruleMatchTypeSchema = z.enum(['domain', 'keyword']);

export const domainRuleSchema = z.object({
  id: z.string(),
  matchType: ruleMatchTypeSchema,
  pattern: z.string().min(1).max(200),
  category: z.string().min(1).max(30),
  enabled: z.boolean(),
});

const urlLike = z
  .string()
  .min(1)
  .max(200)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }, '必须是 http(s) 地址');

export const llmConfigSchema = z.object({
  preset: z.string().min(1).max(30),
  baseUrl: urlLike,
  model: z.string().min(1).max(80),
  apiKey: z.string().max(200).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().positive().max(100_000).optional(),
});

export type LlmConfigPayload = z.infer<typeof llmConfigSchema>;

export interface OrganizePlanStats {
  llmAssigned: number;
  cacheHits: number;
  ruleFallback: number;
  skippedInternal: number;
  batchesFailed: number;
  requests: number;
  totalTokens: number;
  /** 参与分类的网页标签数 */
  candidates: number;
}

export interface PlanEntry {
  tabId: number;
  category: string;
}

export interface OrganizePlan {
  stats: OrganizePlanStats;
  assignments: PlanEntry[];
  /** 本次 AI 自适应新归纳出的类别（已并入用户清单） */
  newCategories: string[];
}

export interface OrganizeSummary extends OrganizePlanStats {
  groups: number;
  groupedTabs: number;
}

export interface LlmUsageStats {
  requests: number;
  totalTokens: number;
  degradedBatches: number;
  lastRunAt?: number;
}

export const requestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('getSnapshot') }),
  z.object({ type: z.literal('activateTab'), tabId: z.number().int() }),
  z.object({ type: z.literal('closeTabs'), tabIds: tabIdsField }),
  z.object({ type: z.literal('setPinned'), tabIds: tabIdsField, pinned: z.boolean() }),
  z.object({ type: z.literal('setMuted'), tabIds: tabIdsField, muted: z.boolean() }),
  z.object({
    type: z.literal('groupTabsByDomain'),
    /** 同域名标签数达到该值才成组（默认 2，避免大量单标签组） */
    minGroupSize: z.number().int().min(1).default(2),
  }),
  z.object({ type: z.literal('sortTabsByDomain') }),
  z.object({ type: z.literal('ungroupTabs'), tabIds: tabIdsField }),
  z.object({
    type: z.literal('createGroupFromSelection'),
    tabIds: tabIdsField,
    title: z.string().min(1).max(40),
  }),
  z.object({ type: z.literal('cleanupDuplicates') }),
  z.object({ type: z.literal('cleanupInactive') }),
  z.object({ type: z.literal('createSnapshot'), label: z.string().max(60).optional() }),
  z.object({ type: z.literal('listSnapshots') }),
  z.object({ type: z.literal('restoreSnapshot'), id: z.string() }),
  z.object({ type: z.literal('deleteSnapshot'), id: z.string() }),
  z.object({ type: z.literal('groupTabsByRules') }),
  z.object({ type: z.literal('listRules') }),
  z.object({ type: z.literal('saveRules'), rules: z.array(domainRuleSchema).max(500) }),
  z.object({ type: z.literal('listCategories') }),
  z.object({
    type: z.literal('saveCategories'),
    categories: z.array(z.string().min(1).max(30)).max(100),
  }),
  z.object({ type: z.literal('organizeByLlm') }),
  z.object({ type: z.literal('testLlmConnection'), config: llmConfigSchema }),
  z.object({ type: z.literal('saveLlmConfig'), config: llmConfigSchema }),
  z.object({ type: z.literal('getLlmConfig') }),
  z.object({ type: z.literal('getLlmUsage') }),
  z.object({ type: z.literal('clearLlmUsage') }),
  z.object({ type: z.literal('clearCategoryCache') }),
  z.object({ type: z.literal('planOrganizeByLlm') }),
  z.object({
    type: z.literal('applyCategoryPlan'),
    assignments: z
      .array(z.object({ tabId: z.number().int(), category: z.string().min(1).max(30) }))
      .max(1000),
  }),
  z.object({ type: z.literal('getUiSettings') }),
  z.object({
    type: z.literal('saveUiSettings'),
    language: z.enum(['zh', 'en']).optional(),
    autoApply: z.boolean().optional(),
    realtime: z.boolean().optional(),
    minGroupSizeForRules: z.number().int().min(2).max(50).optional(),
    autoOrganize: z
      .object({
        mode: z.enum(['off', 'interval', 'threshold']),
        intervalMinutes: z.number().int().min(5).max(1440),
        thresholdCount: z.number().int().min(2).max(200),
      })
      .optional(),
  }),
  z.object({ type: z.literal('getExportBundle') }),
  z.object({
    type: z.literal('learnFromCorrections'),
    corrections: z
      .array(
        z.object({
          url: z.string().min(1).max(2000),
          category: z.string().min(1).max(30),
        }),
      )
      .max(200),
  }),
]);

export type Request = z.infer<typeof requestSchema>;
/** 客户端发送时的输入形态：允许省略带默认值的字段。 */
export type RequestInput = z.input<typeof requestSchema>;

export type RequestPayloadMap = {
  getSnapshot: TabMetaMessage[];
  activateTab: null;
  closeTabs: { closed: number };
  setPinned: null;
  setMuted: null;
  groupTabsByDomain: { groups: number; groupedTabs: number };
  sortTabsByDomain: { moved: number };
  ungroupTabs: null;
  createGroupFromSelection: { groupId: number };
  cleanupDuplicates: { closed: number; snapshotId: string };
  cleanupInactive: { closed: number; snapshotId: string };
  createSnapshot: { snapshotId: string };
  listSnapshots: Array<{ id: string; createdAt: number; label: string; reason: string; count: number }>;
  restoreSnapshot: { opened: number; skipped: number };
  deleteSnapshot: null;
  groupTabsByRules: { groups: number; groupedTabs: number; unmatched: number };
  listRules: DomainRule[];
  saveRules: null;
  listCategories: string[];
  saveCategories: null;
  organizeByLlm: OrganizeSummary;
  testLlmConnection: { ok: boolean; latencyMs: number; error?: string };
  saveLlmConfig: null;
  getLlmConfig: LlmConfigPayload | null;
  getLlmUsage: LlmUsageStats;
  clearLlmUsage: null;
  clearCategoryCache: null;
  planOrganizeByLlm: OrganizePlan;
  applyCategoryPlan: { groups: number; groupedTabs: number };
  getUiSettings: { language: 'zh' | 'en'; autoApply: boolean; realtime: boolean; minGroupSizeForRules: number; autoOrganize: {
    mode: 'off' | 'interval' | 'threshold';
    intervalMinutes: number;
    thresholdCount: number;
  } };
  saveUiSettings: null;
  learnFromCorrections: { added: number; updated: number };
  getExportBundle: {
    rules: DomainRule[];
    categories: string[];
    minGroupSizeForRules: number;
    autoApply: boolean;
    autoOrganize: { mode: 'off' | 'interval' | 'threshold'; intervalMinutes: number; thresholdCount: number };
    language: 'zh' | 'en';
    realtime: boolean;
    llm: { preset: string; baseUrl: string; model: string; apiKey?: string; temperature?: number; maxOutputTokens?: number } | null;
  };
};

// ---------- Background -> Pages ----------

export const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tabsUpdated'), windowId: z.number(), tabs: z.array(tabMetaSchema) }),
  z.object({
    type: z.literal('settingsChanged'),
    language: z.enum(['zh', 'en']),
    autoApply: z.boolean(),
  }),
]);

export type Event = z.infer<typeof eventSchema>;

// ---------- 响应信封 ----------

export const resultSchema = z.union([
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

/** 判断未知消息是否为广播事件（不抛错）。 */
export function parseEvent(payload: unknown): Event | null {
  const parsed = eventSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}
