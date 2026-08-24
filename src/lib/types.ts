/** 领域模型：扩展内部流转的标签元数据（与浏览器 Tab 对象解耦，便于缓存与测试）。 */

export interface TabMeta {
  id: number;
  windowId: number;
  index: number;
  title: string;
  url: string;
  favIconUrl?: string;
  pinned: boolean;
  audible: boolean;
  /** 来自 mutedInfo.muted */
  muted: boolean;
  active: boolean;
  /** -1 表示未分组 */
  groupId: number;
}

/** 快照中保存的最小标签信息（恢复时重建）。 */
export interface SnapshotTab {
  title: string;
  url: string;
  pinned: boolean;
}

export type SnapshotReason = 'manual' | 'cleanup-duplicates' | 'cleanup-inactive';

export interface Snapshot {
  id: string;
  createdAt: number;
  label: string;
  reason: SnapshotReason;
  tabs: SnapshotTab[];
}

/** 统一响应信封：所有 request/response 走这个结构。 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err(error: unknown): Result<never> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}
