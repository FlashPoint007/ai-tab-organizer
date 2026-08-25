import { describe, expect, it } from 'vitest';

import type { DomainRule } from '../settings/types';
import { mergeLearnedRules } from './learning';
import type { Correction } from './learning';

let seq = 0;
const newId = (): string => 'id-' + ++seq;

const existing: DomainRule[] = [
  { id: 'r1', matchType: 'domain', pattern: 'github.com', category: '开发工具', enabled: true },
  { id: 'r2', matchType: 'keyword', pattern: '论文', category: '学习资料', enabled: true },
];

describe('mergeLearnedRules', () => {
  it('新主机追加为域名规则（去 www、小写）', () => {
    const corrections: Correction[] = [{ url: 'https://www.BitTo.cn/app', category: 'AI 助手' }];
    const out = mergeLearnedRules(existing, corrections, newId);

    expect(out.added).toBe(1);
    expect(out.updated).toBe(0);
    const added = out.rules.at(-1);
    expect(added).toMatchObject({ matchType: 'domain', pattern: 'bitto.cn', category: 'AI 助手', enabled: true });
    expect(added?.id).toBe('id-1');
  });

  it('同主机已有域名规则时只更新类别，保留位置与 id', () => {
    const corrections: Correction[] = [{ url: 'https://github.com/repo', category: '学习资料' }];
    const out = mergeLearnedRules(existing, corrections, newId);

    expect(out.added).toBe(0);
    expect(out.updated).toBe(1);
    expect(out.rules[0]).toMatchObject({ id: 'r1', pattern: 'github.com', category: '学习资料' });
    expect(out.rules).toHaveLength(2);
  });

  it('子域修正生成更具体的规则，并插到宽泛规则之前（否则不生效）', () => {
    const corrections: Correction[] = [{ url: 'https://gist.github.com/x', category: '笔记' }];
    const out = mergeLearnedRules(existing, corrections, newId);
    expect(out.added).toBe(1);
    expect(out.updated).toBe(0);
    // 插在 github.com 宽泛规则前面，先匹配先赢
    expect(out.rules[0]).toMatchObject({ pattern: 'gist.github.com', category: '笔记' });
    expect(out.rules[1]).toMatchObject({ pattern: 'github.com' });
  });

  it('同一批同主机多条以最后一条为准；非法 URL 与空类别跳过', () => {
    const corrections: Correction[] = [
      { url: 'https://a.com/', category: 'X' },
      { url: 'https://a.com/b', category: 'Y' },
      { url: 'not-a-url', category: 'Z' },
      { url: 'https://c.com/', category: '  ' },
    ];
    const out = mergeLearnedRules([], corrections, newId);
    expect(out.added).toBe(1);
    expect(out.rules[0]).toMatchObject({ pattern: 'a.com', category: 'Y' });
  });

  it('禁用状态的既有规则也会被更新（但不改变启停）', () => {
    const disabled: DomainRule[] = [{ id: 'd1', matchType: 'domain', pattern: 'a.com', category: '旧', enabled: false }];
    const out = mergeLearnedRules(disabled, [{ url: 'https://a.com/', category: '新' }], newId);
    expect(out.updated).toBe(1);
    expect(out.rules[0]).toMatchObject({ category: '新', enabled: false });
  });
});
