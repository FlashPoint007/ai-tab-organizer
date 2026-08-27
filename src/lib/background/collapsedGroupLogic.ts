/**
 * 折叠组标题策略（纯函数，无浏览器依赖）。
 *
 * Chrome 的折叠组 chip 宽度与 tooltip 都来自同一个 title 字段：
 * - title 为空  -> 只剩色点，但 hover 显示「未命名的组」
 * - title 全名  -> hover 信息完整，但把标签栏占满
 * - title 缩写  -> chip 很窄，hover 能看出是哪个组（默认策略）
 */
import type { CollapsedTitleMode } from '../settings/types';

export type { CollapsedTitleMode };

/** 折叠期间暂存的真名与我们写入的缩写，用于展开还原与改名识别。 */
export interface SavedTitle {
  full: string;
  short: string;
}

export interface GroupLike {
  id: number;
  title?: string;
}

/** 取标题缩写，按「字符」而非字节切分，兼容 CJK 与 emoji。 */
export function abbreviateTitle(title: string, maxChars = 2): string {
  const chars = Array.from(title.trim());
  const limit = Math.max(1, maxChars);
  return chars.slice(0, limit).join('');
}

/**
 * 按「实际名字」找目标标签组。
 * 折叠组的 title 已被换成缩写或清空，真名在 savedTitles 里，
 * 因此暂存名优先，否则实时归类会给同一类别重复建组。
 */
export function findGroupIdForCategory(
  groups: readonly GroupLike[],
  savedTitles: Record<number, SavedTitle>,
  category: string,
): number | undefined {
  for (const group of groups) {
    const saved = savedTitles[group.id];
    const current = group.title ?? '';
    // 当前标题正是我们写入的缩写（或被清空）时用暂存真名；
    // 用户在折叠期间改过名则以用户的名字为准。
    const effectiveTitle =
      saved && (current === '' || current === saved.short) ? saved.full : current || saved?.full || '';
    if (effectiveTitle === category) return group.id;
  }
  return undefined;
}

/** 折叠/展开时的标题迁移决策。 */
export function applyCollapseTransition(params: {
  collapsing: boolean;
  currentTitle: string;
  saved?: SavedTitle;
  mode: CollapsedTitleMode;
  abbreviationChars?: number;
}): { newTitle: string; save?: SavedTitle; clearSaved?: boolean } {
  const { collapsing, currentTitle, saved, mode, abbreviationChars = 2 } = params;

  if (collapsing) {
    // keep：折叠也保留全名，不需要暂存
    if (mode === 'keep') {
      return { newTitle: saved?.full || currentTitle, clearSaved: true };
    }
    // 已瘦身过的组用暂存真名作为来源，避免把缩写再缩写一次而丢失真名
    const source = saved?.full || currentTitle;
    if (!source) return { newTitle: '' };
    const short = mode === 'hide' ? '' : abbreviateTitle(source, abbreviationChars);
    return { newTitle: short, save: { full: source, short } };
  }

  // 展开：区分「我们写入的缩写」与「用户在折叠期间的改名」
  if (saved) {
    const untouched = currentTitle === saved.short;
    return { newTitle: untouched ? saved.full : currentTitle, clearSaved: true };
  }
  return { newTitle: currentTitle };
}
