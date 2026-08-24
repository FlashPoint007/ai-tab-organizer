import { describe, expect, it } from 'vitest';

import type { DomainRule } from '../settings/types';
import type { TabMeta } from '../types';
import { fnv1a32 } from '../../utils/hash';
import {
  applyRules,
  colorForCategory,
  computeCategoryGroups,
  matchRule,
  normalizeDomainPattern,
} from './rules';

function rule(partial: Partial<DomainRule> & Pick<DomainRule, 'pattern' | 'category'>): DomainRule {
  return { id: partial.pattern, matchType: 'domain', enabled: true, ...partial };
}

function tab(partial: Partial<TabMeta> & Pick<TabMeta, 'id' | 'url'>): TabMeta {
  return {
    windowId: 1,
    index: 0,
    title: '',
    pinned: false,
    audible: false,
    muted: false,
    active: false,
    groupId: -1,
    ...partial,
  };
}

describe('normalizeDomainPattern', () => {
  it('容忍粘贴完整 URL、去 www、去路径与端口、大小写归一', () => {
    expect(normalizeDomainPattern('https://www.GitHub.com/flash')).toBe('github.com');
    expect(normalizeDomainPattern('docs.example.com:8080/path')).toBe('docs.example.com');
    expect(normalizeDomainPattern('  Bilibili.COM  ')).toBe('bilibili.com');
  });

  it('空串或纯非法输入返回空串', () => {
    expect(normalizeDomainPattern('   ')).toBe('');
    expect(normalizeDomainPattern('://')).toBe('');
  });
});

describe('matchRule(domain)', () => {
  const r = rule({ pattern: 'github.com', category: '开发工具' });

  it('精确主机与子域命中，www 已归一', () => {
    expect(matchRule(r, tab({ id: 1, url: 'https://github.com/a' }))).toBe(true);
    expect(matchRule(r, tab({ id: 2, url: 'https://gist.github.com/b' }))).toBe(true);
    expect(matchRule(r, tab({ id: 3, url: 'https://www.github.com/c' }))).toBe(true);
  });

  it('后缀相似但不同的域不命中（防 eviltwin）', () => {
    expect(matchRule(r, tab({ id: 4, url: 'https://notgithub.com/' }))).toBe(false);
  });

  it('非 http(s) 页面不参与域名规则', () => {
    expect(matchRule(r, tab({ id: 5, url: 'chrome://extensions' }))).toBe(false);
  });
});

describe('matchRule(keyword)', () => {
  const r = rule({ matchType: 'keyword', pattern: '论文', category: '学习资料' });

  it('标题命中；英文关键词对 URL 大小写不敏感', () => {
    expect(matchRule(r, tab({ id: 1, url: 'https://x.com/', title: 'A Survey of LLM 论文笔记' }))).toBe(true);
    const en = rule({ matchType: 'keyword', pattern: 'ARXIV', category: '学习资料' });
    expect(matchRule(en, tab({ id: 2, url: 'https://arxiv.org/abs/1', title: '' }))).toBe(true);
  });

  it('未命中返回 false；禁用规则恒为 false', () => {
    expect(matchRule(r, tab({ id: 3, url: 'https://x.com/', title: '购物车' }))).toBe(false);
    expect(matchRule({ ...r, enabled: false }, tab({ id: 4, url: 'https://x.com/论文' }))).toBe(false);
  });
});

describe('applyRules', () => {
  it('数组顺序即优先级，先匹配先赢', () => {
    const rules = [
      rule({ pattern: 'github.com', category: 'A' }),
      rule({ pattern: 'github.com', category: 'B' }),
    ];
    const got = applyRules([tab({ id: 1, url: 'https://github.com/' })], rules);
    expect(got.get(1)).toBe('A');
  });

  it('未命中的标签不出现在结果里', () => {
    const got = applyRules(
      [tab({ id: 1, url: 'https://known.com/' }), tab({ id: 2, url: 'https://unknown.com/' })],
      [rule({ pattern: 'known.com', category: 'X' })],
    );
    expect(got.size).toBe(1);
    expect(got.get(1)).toBe('X');
  });
});

describe('computeCategoryGroups', () => {
  const tabs = [
    tab({ id: 1, url: 'https://a.com/' }),
    tab({ id: 2, url: 'https://b.com/' }),
    tab({ id: 3, url: 'https://c.com/' }),
  ];
  const assignments = new Map([
    [1, '工作'],
    [2, '娱乐'],
    [3, '工作'],
  ]);

  it('按类别聚合并按名称升序', () => {
    expect(computeCategoryGroups(tabs, assignments)).toEqual([
      { category: '娱乐', tabIds: [2] },
      { category: '工作', tabIds: [1, 3] },
    ]);
  });

  it('minGroupSize 过滤小簇', () => {
    expect(computeCategoryGroups(tabs, assignments, 2)).toEqual([{ category: '工作', tabIds: [1, 3] }]);
  });
});

describe('colorForCategory / fnv1a32', () => {
  it('FNV-1a 标准测试向量', () => {
    expect(fnv1a32('hello').toString(16)).toBe('4f9f2cab');
  });

  it('同一类别颜色稳定，不同类别大概率不同色', () => {
    expect(colorForCategory('开发工具')).toBe(colorForCategory('开发工具'));
    const colors = new Set(['开发工具', '设计创意', '学习资料'].map(colorForCategory));
    expect(colors.size).toBeGreaterThan(1);
  });
});
