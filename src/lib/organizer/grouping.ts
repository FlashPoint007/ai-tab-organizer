import type { TabMeta } from '../types';
import { isWebUrl, parseGroupName } from './domains';

export interface DomainGroup {
  domain: string;
  tabIds: number[];
}

/** Chrome tabGroups 支持的全部颜色，按序轮转分配。 */
export const GROUP_COLORS = [
  'blue',
  'cyan',
  'green',
  'yellow',
  'orange',
  'red',
  'pink',
  'purple',
  'grey',
] as const;

export type GroupColor = (typeof GROUP_COLORS)[number];

export interface GroupOptions {
  /** 同域标签数达到该值才成组（默认 2） */
  minGroupSize?: number;
  /** 是否把固定标签也纳入分组（默认 false） */
  includePinned?: boolean;
}

/**
 * 计算域名分组方案（纯函数，不做任何浏览器操作）。
 * 返回按域名升序的分组列表；组内 tabIds 保持原有标签顺序。
 */
export function computeDomainGroups(tabs: TabMeta[], options: GroupOptions = {}): DomainGroup[] {
  const minGroupSize = Math.max(1, options.minGroupSize ?? 2);
  const includePinned = options.includePinned ?? false;

  const byDomain = new Map<string, number[]>();
  for (const tab of tabs) {
    if (!isWebUrl(tab.url)) continue;
    if (tab.pinned && !includePinned) continue;
    const domain = parseGroupName(tab.url);
    if (!domain) continue;
    const bucket = byDomain.get(domain);
    if (bucket) bucket.push(tab.id);
    else byDomain.set(domain, [tab.id]);
  }

  return [...byDomain.entries()]
    .filter(([, ids]) => ids.length >= minGroupSize)
    .map(([domain, ids]) => ({ domain, tabIds: ids }))
    .sort((a, b) => (a.domain < b.domain ? -1 : a.domain > b.domain ? 1 : 0));
}

/** 为分组列表确定性分配颜色：同输入永远得到同色。 */
export function assignGroupColors(groups: DomainGroup[]): Map<string, GroupColor> {
  const colors = new Map<string, GroupColor>();
  groups.forEach((group, i) => {
    const color = GROUP_COLORS[i % GROUP_COLORS.length];
    if (color) colors.set(group.domain, color);
  });
  return colors;
}
