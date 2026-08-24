/**
 * 类型化消息协议。
 *
 * - Request：Side Panel / Options → Background（runtime.sendMessage，等待回包）
 * - Event：Background → 所有扩展页面（广播，无回包）
 *
 * 所有载荷用 zod 校验：跨信任边界的数据一律先过 schema 再使用。
 */
import { z } from 'zod';

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
};

// ---------- Background -> Pages ----------

export const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tabsUpdated'), windowId: z.number(), tabs: z.array(tabMetaSchema) }),
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
