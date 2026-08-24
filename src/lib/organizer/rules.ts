/** 规则引擎：把标签映射到类别（纯函数，无浏览器依赖）。 */
import { fnv1a32 } from '../../utils/hash';
import type { TabMeta } from '../types';
import type { DomainRule, RuleMatchType } from '../settings/types';
import { isWebUrl } from './domains';
import { GROUP_COLORS } from './grouping';
import type { GroupColor } from './grouping';

/**
 * 归一化域名 pattern：
 * - 容忍用户直接粘贴 URL（取 hostname）
 * - 小写、去 www. 前缀
 * - 非法输入返回空串（该规则永不匹配）
 */
export function normalizeDomainPattern(pattern: string): string {
  const raw = pattern.trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes('://') || raw.startsWith('localhost')) {
    try {
      return new URL(raw.includes('://') ? raw : `http://${raw}`).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }
  // 去掉可能粘贴进来的路径/端口
  const pathless = raw.split('/')[0] ?? '';
  const portless = pathless.split(':')[0] ?? '';
  return portless.replace(/^www\./, '');
}

function hostMatches(host: string, normalizedPattern: string): boolean {
  if (!normalizedPattern) return false;
  return host === normalizedPattern || host.endsWith(`.${normalizedPattern}`);
}

export function matchRule(rule: DomainRule, tab: TabMeta): boolean {
  if (!rule.enabled) return false;

  if (rule.matchType === 'domain') {
    if (!isWebUrl(tab.url)) return false;
    let host: string;
    try {
      host = new URL(tab.url).hostname.toLowerCase();
    } catch {
      return false;
    }
    return hostMatches(host, normalizeDomainPattern(rule.pattern));
  }

  // keyword：标题或网址的大小写不敏感子串
  const needle = rule.pattern.trim().toLowerCase();
  if (!needle) return false;
  return tab.title.toLowerCase().includes(needle) || tab.url.toLowerCase().includes(needle);
}

export interface CategoryAssignment {
  tabId: number;
  category: string;
}

/**
 * 按规则顺序给标签分配类别；先匹配先赢。
 * 未命中任何规则的标签不出现在结果里。
 */
export function applyRules(tabs: TabMeta[], rules: DomainRule[]): Map<number, string> {
  const result = new Map<number, string>();
  for (const tab of tabs) {
    for (const rule of rules) {
      if (matchRule(rule, tab)) {
        result.set(tab.id, rule.category);
        break;
      }
    }
  }
  return result;
}

export interface CategoryGroup {
  category: string;
  tabIds: number[];
}

/**
 * 计算类别分组方案：按类别名升序，组内保持标签原顺序；
 * 类别内标签数 < minGroupSize 的不成组。
 */
export function computeCategoryGroups(
  tabs: TabMeta[],
  assignments: Map<number, string>,
  minGroupSize = 1,
): CategoryGroup[] {
  const byCategory = new Map<string, number[]>();
  for (const tab of tabs) {
    const category = assignments.get(tab.id);
    if (!category) continue;
    const bucket = byCategory.get(category);
    if (bucket) bucket.push(tab.id);
    else byCategory.set(category, [tab.id]);
  }

  return [...byCategory.entries()]
    .filter(([, ids]) => ids.length >= Math.max(1, minGroupSize))
    .map(([category, ids]) => ({ category, tabIds: ids }))
    .sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
}

/**
 * 类别的稳定配色：同一类别永远同色（与分组顺序无关）。
 */
export function colorForCategory(category: string): GroupColor {
  const color = GROUP_COLORS[fnv1a32(category) % GROUP_COLORS.length];
  return color ?? 'grey';
}

/** 规则类型的中文名（UI 用）。 */
export function matchTypeLabel(matchType: RuleMatchType): string {
  return matchType === 'domain' ? '域名' : '关键词';
}
