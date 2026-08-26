export interface GroupLike {
  id: number;
  title?: string;
}

/**
 * 按「实际名字」找目标标签组。
 * 折叠组的 title 被临时置空（标签栏只显示色点），真名存在 savedTitles 里，
 * 所以两处都要看，否则实时归类会给同一类别重复建组。
 */
export function findGroupIdForCategory(
  groups: readonly GroupLike[],
  savedTitles: Record<number, string>,
  category: string,
): number | undefined {
  for (const group of groups) {
    const effectiveTitle = group.title || savedTitles[group.id] || '';
    if (effectiveTitle === category) return group.id;
  }
  return undefined;
}

/** 折叠/展开时的标题迁移决策（纯函数，无浏览器依赖）。 */
export function applyCollapseTransition(params: {
  collapsing: boolean;
  currentTitle: string;
  savedTitle?: string;
}): { newTitle: string; save?: string; clearSaved?: boolean } {
  const { collapsing, currentTitle, savedTitle } = params;
  if (collapsing) {
    if (currentTitle) return { newTitle: '', save: currentTitle };
    return { newTitle: '' };
  }

  // 展开：若用户已经写入非空新名字就尊重它，否则还原暂存名
  if (currentTitle) return { newTitle: currentTitle, clearSaved: true };
  if (savedTitle) return { newTitle: savedTitle, clearSaved: true };
  return { newTitle: '' };
}
