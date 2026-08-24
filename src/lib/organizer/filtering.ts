import type { TabMeta } from '../types';

/** 大小写不敏感的子串匹配，命中 title 或 url 即保留；query 为空白时返回全部。 */
export function filterTabs(tabs: TabMeta[], query: string): TabMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return tabs;
  return tabs.filter(
    (tab) => tab.title.toLowerCase().includes(q) || tab.url.toLowerCase().includes(q),
  );
}
