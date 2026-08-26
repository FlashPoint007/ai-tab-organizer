import { describe, expect, it } from 'vitest';

import type { TabMeta } from '../types';
import { parseGroupName } from './domains';
import { cleanupCandidatesFromClusters, findDuplicateTabs, findInactiveTabs } from './cleanup';
import { filterTabs } from './filtering';
import {
  assignGroupColors,
  computeDomainGroups,
  foldSingletonCategories,
} from './grouping';

function tab(partial: Partial<TabMeta> & Pick<TabMeta, 'id' | 'url'>): TabMeta {
  return {
    windowId: 1,
    index: partial.id ?? 0,
    title: '',
    favIconUrl: undefined,
    pinned: false,
    audible: false,
    muted: false,
    active: false,
    groupId: -1,
    ...partial,
  };
}

describe('parseGroupName', () => {
  it('取 hostname 并去掉 www.，大小写归一', () => {
    expect(parseGroupName('https://WWW.GitHub.com/flash')).toBe('github.com');
  });

  it('非 http(s) 或非法 URL 返回空串', () => {
    expect(parseGroupName('chrome://newtab')).toBe('');
    expect(parseGroupName('garbage')).toBe('');
  });
});

describe('computeDomainGroups', () => {
  const tabs: TabMeta[] = [
    tab({ id: 1, url: 'https://a.com/x', pinned: true }),
    tab({ id: 2, url: 'https://a.com/y' }),
    tab({ id: 3, url: 'https://www.a.com/z' }),
    tab({ id: 4, url: 'https://b.com/' }),
    tab({ id: 5, url: 'chrome://extensions' }),
  ];

  it('默认 minGroupSize=2：单标签域不成组，固定标签不参与', () => {
    const groups = computeDomainGroups(tabs);
    expect(groups).toEqual([{ domain: 'a.com', tabIds: [2, 3] }]);
  });

  it('minGroupSize=1 时单标签域也成组且按域名排序', () => {
    const groups = computeDomainGroups(tabs, { minGroupSize: 1 });
    expect(groups.map((g) => g.domain)).toEqual(['a.com', 'b.com']);
    expect(groups.at(1)?.tabIds).toEqual([4]);
  });

  it('includePinned=true 时固定标签参与分组', () => {
    const groups = computeDomainGroups(tabs, { includePinned: true });
    expect(groups.at(0)?.tabIds).toEqual([1, 2, 3]);
  });

  it('颜色分配确定性且循环使用调色板', () => {
    const groups = computeDomainGroups(tabs, { minGroupSize: 1 });
    const colors = assignGroupColors(groups);
    expect(colors.get('a.com')).toBe(colors.get('a.com'));
    expect(colors.size).toBe(2);
  });
});

describe('findDuplicateTabs', () => {
  it('同 URL 归一化后聚簇，保留激活页', () => {
    const tabs: TabMeta[] = [
      tab({ id: 1, url: 'https://example.com/a?utm_source=x' }),
      tab({ id: 2, url: 'https://example.com/a#top', active: true }),
      tab({ id: 3, url: 'https://other.com/' }),
    ];
    const clusters = findDuplicateTabs(tabs);
    expect(clusters).toEqual([{ keepTabId: 2, removeTabIds: [1] }]);
  });

  it('无激活页时优先保留固定页，其次更早的页', () => {
    const tabs: TabMeta[] = [
      tab({ id: 5, index: 2, url: 'https://dup.com/' }),
      tab({ id: 4, index: 0, url: 'https://dup.com/', pinned: true }),
      tab({ id: 9, index: 1, url: 'https://dup.com/' }),
    ];
    expect(findDuplicateTabs(tabs).at(0)?.keepTabId).toBe(4);
  });

  it('内部页与唯一页面不产生簇', () => {
    const tabs: TabMeta[] = [tab({ id: 1, url: 'chrome://settings' }), tab({ id: 2, url: 'https://x.com/' })];
    expect(findDuplicateTabs(tabs)).toEqual([]);
  });

  it('cleanupCandidatesFromDuplicates 汇总待关闭 id 并排除保留页', () => {
    const clusters = [
      { keepTabId: 1, removeTabIds: [2, 3] },
      { keepTabId: 5, removeTabIds: [6] },
    ];
    expect(cleanupCandidatesFromClusters(clusters)).toEqual([2, 3, 6]);
  });
});

describe('findInactiveTabs', () => {
  it('排除激活/固定/有声/内部页', () => {
    const tabs: TabMeta[] = [
      tab({ id: 1, url: 'https://a.com/', active: true }),
      tab({ id: 2, url: 'https://b.com/', pinned: true }),
      tab({ id: 3, url: 'https://c.com/', audible: true }),
      tab({ id: 4, url: 'chrome://version' }),
      tab({ id: 5, url: 'https://d.com/' }),
    ];
    expect(findInactiveTabs(tabs)).toEqual([5]);
  });
});

describe('filterTabs', () => {
  const tabs: TabMeta[] = [
    tab({ id: 1, url: 'https://github.com/a', title: 'GitHub Repo' }),
    tab({ id: 2, url: 'https://bilibili.com/', title: '哔哩哔哩 (゜-゜)つロ' }),
  ];

  it('空白 query 返回全部', () => {
    expect(filterTabs(tabs, '  ')).toHaveLength(2);
  });

  it('title 与 url 均参与大小写不敏感匹配', () => {
    expect(filterTabs(tabs, 'git').map((t) => t.id)).toEqual([1]);
    expect(filterTabs(tabs, 'BILIBILI').map((t) => t.id)).toEqual([2]);
  });
});

describe('foldSingletonCategories', () => {
  const build = (pairs: Array<[number, string]>): Map<number, string> => new Map(pairs);

  it('不足门槛的孤类并入「其他」，达标的保留', () => {
    const assignments = build([
      [1, '开发工具'],
      [2, '开发工具'],
      [3, '设计创意'],
    ]);
    const got = foldSingletonCategories(assignments, 2, '其他');
    expect(got.get(1)).toBe('开发工具');
    expect(got.get(2)).toBe('开发工具');
    expect(got.get(3)).toBe('其他');
  });

  it('fallback 自身已有成员时不参与折叠', () => {
    const assignments = build([
      [1, '其他'],
      [2, '孤类A'],
      [3, '孤类B'],
    ]);
    const got = foldSingletonCategories(assignments, 2, '其他');
    expect(got.get(1)).toBe('其他');
    expect(got.get(2)).toBe('其他');
    expect(got.get(3)).toBe('其他');
  });

  it('全部达标时内容等价返回', () => {
    const assignments = build([
      [1, 'A'],
      [2, 'A'],
      [3, 'B'],
      [4, 'B'],
    ]);
    const got = foldSingletonCategories(assignments, 2, '其他');
    expect([...got.entries()]).toEqual([...assignments.entries()]);
  });
});
