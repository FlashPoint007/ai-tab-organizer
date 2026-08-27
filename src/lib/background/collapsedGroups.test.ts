import { describe, expect, it } from 'vitest';

import {
  abbreviateTitle,
  applyCollapseTransition,
  findGroupIdForCategory,
} from './collapsedGroupLogic';

describe('abbreviateTitle', () => {
  it('按字符截取，默认 2 个字', () => {
    expect(abbreviateTitle('开发工具与监控')).toBe('开发');
    expect(abbreviateTitle('B站内部平台')).toBe('B站');
  });

  it('尊重自定义长度，并至少保留 1 个字符', () => {
    expect(abbreviateTitle('开发工具与监控', 3)).toBe('开发工');
    expect(abbreviateTitle('开发工具与监控', 0)).toBe('开');
  });

  it('先 trim；emoji 按整字符切分不被截断', () => {
    expect(abbreviateTitle('  云平台  ')).toBe('云平');
    expect(abbreviateTitle('🚀🎯🔥', 2)).toBe('🚀🎯');
  });
});

describe('applyCollapseTransition · 折叠', () => {
  it('abbreviate：写入缩写并暂存真名与缩写', () => {
    const out = applyCollapseTransition({
      collapsing: true,
      currentTitle: '开发调试工具',
      mode: 'abbreviate',
    });
    expect(out).toEqual({
      newTitle: '开发',
      save: { full: '开发调试工具', short: '开发' },
    });
  });

  it('hide：清空标题（只剩色点），仍暂存真名', () => {
    const out = applyCollapseTransition({
      collapsing: true,
      currentTitle: '开发调试工具',
      mode: 'hide',
    });
    expect(out).toEqual({ newTitle: '', save: { full: '开发调试工具', short: '' } });
  });

  it('keep：保留全名且清除暂存', () => {
    const out = applyCollapseTransition({
      collapsing: true,
      currentTitle: '开发',
      saved: { full: '开发调试工具', short: '开发' },
      mode: 'keep',
    });
    expect(out).toEqual({ newTitle: '开发调试工具', clearSaved: true });
  });

  it('重复折叠已瘦身的组：以暂存真名为源，不会把缩写再缩写', () => {
    const out = applyCollapseTransition({
      collapsing: true,
      currentTitle: '开发',
      saved: { full: '开发调试工具', short: '开发' },
      mode: 'abbreviate',
    });
    expect(out).toEqual({
      newTitle: '开发',
      save: { full: '开发调试工具', short: '开发' },
    });
  });

  it('本来就没有名字：维持空', () => {
    const out = applyCollapseTransition({ collapsing: true, currentTitle: '', mode: 'abbreviate' });
    expect(out).toEqual({ newTitle: '' });
  });
});

describe('applyCollapseTransition · 展开', () => {
  it('标题仍是我们写的缩写 -> 还原全名并清暂存', () => {
    const out = applyCollapseTransition({
      collapsing: false,
      currentTitle: '开发',
      saved: { full: '开发调试工具', short: '开发' },
      mode: 'abbreviate',
    });
    expect(out).toEqual({ newTitle: '开发调试工具', clearSaved: true });
  });

  it('hide 模式下标题为空 -> 还原全名', () => {
    const out = applyCollapseTransition({
      collapsing: false,
      currentTitle: '',
      saved: { full: '开发调试工具', short: '' },
      mode: 'hide',
    });
    expect(out).toEqual({ newTitle: '开发调试工具', clearSaved: true });
  });

  it('用户在折叠期间改了名 -> 尊重用户的新名字', () => {
    const out = applyCollapseTransition({
      collapsing: false,
      currentTitle: '我的组',
      saved: { full: '开发调试工具', short: '开发' },
      mode: 'abbreviate',
    });
    expect(out).toEqual({ newTitle: '我的组', clearSaved: true });
  });

  it('没有暂存记录 -> 原样保留', () => {
    const out = applyCollapseTransition({
      collapsing: false,
      currentTitle: '用户自建组',
      mode: 'abbreviate',
    });
    expect(out).toEqual({ newTitle: '用户自建组' });
  });
});

describe('findGroupIdForCategory', () => {
  it('按当前标题匹配', () => {
    const groups = [
      { id: 1, title: '开发工具与监控' },
      { id: 2, title: 'B站内部平台' },
    ];
    expect(findGroupIdForCategory(groups, {}, 'B站内部平台')).toBe(2);
  });

  it('标题是缩写时按暂存真名匹配（避免重复建组）', () => {
    const groups = [{ id: 7, title: '开发' }];
    const saved = { 7: { full: '开发工具与监控', short: '开发' } };
    expect(findGroupIdForCategory(groups, saved, '开发工具与监控')).toBe(7);
  });

  it('hide 模式标题为空时也能按暂存真名匹配', () => {
    const groups = [{ id: 8, title: '' }];
    const saved = { 8: { full: '云平台与控制台', short: '' } };
    expect(findGroupIdForCategory(groups, saved, '云平台与控制台')).toBe(8);
  });

  it('用户改名后以用户的名字为准', () => {
    const groups = [{ id: 3, title: '我的组' }];
    const saved = { 3: { full: '旧类别', short: '旧类' } };
    expect(findGroupIdForCategory(groups, saved, '旧类别')).toBeUndefined();
    expect(findGroupIdForCategory(groups, saved, '我的组')).toBe(3);
  });

  it('没有匹配返回 undefined', () => {
    expect(findGroupIdForCategory([{ id: 1, title: 'A' }], {}, 'B')).toBeUndefined();
    expect(findGroupIdForCategory([], {}, 'A')).toBeUndefined();
  });
});
