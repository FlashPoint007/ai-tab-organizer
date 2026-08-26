import { describe, expect, it } from 'vitest';

import { applyCollapseTransition, findGroupIdForCategory } from './collapsedGroupLogic';

describe('applyCollapseTransition', () => {
  it('折叠：有名字 -> 置空并暂存', () => {
    const out = applyCollapseTransition({ collapsing: true, currentTitle: '开发调试工具' });
    expect(out).toEqual({ newTitle: '', save: '开发调试工具' });
  });

  it('折叠：已无名字 -> 维持空', () => {
    const out = applyCollapseTransition({ collapsing: true, currentTitle: '' });
    expect(out).toEqual({ newTitle: '' });
  });

  it('展开：无名字且有暂存 -> 还原并清除暂存', () => {
    const out = applyCollapseTransition({
      collapsing: false,
      currentTitle: '',
      savedTitle: '开发调试工具',
    });
    expect(out).toEqual({ newTitle: '开发调试工具', clearSaved: true });
  });

  it('展开：用户在折叠期间改了名 -> 尊重新名字并清暂存', () => {
    const out = applyCollapseTransition({
      collapsing: false,
      currentTitle: '新名字',
      savedTitle: '旧名字',
    });
    expect(out).toEqual({ newTitle: '新名字', clearSaved: true });
  });

  it('展开：无名字也无暂存 -> 维持空', () => {
    const out = applyCollapseTransition({ collapsing: false, currentTitle: '' });
    expect(out).toEqual({ newTitle: '' });
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

  it('折叠组标题被置空时按暂存名匹配（避免重复建组）', () => {
    const groups = [{ id: 7, title: '' }];
    expect(findGroupIdForCategory(groups, { 7: '开发工具与监控' }, '开发工具与监控')).toBe(7);
  });

  it('当前标题优先于暂存名（用户改名后尊重新名字）', () => {
    const groups = [{ id: 3, title: '新名字' }];
    expect(findGroupIdForCategory(groups, { 3: '旧名字' }, '旧名字')).toBeUndefined();
    expect(findGroupIdForCategory(groups, { 3: '旧名字' }, '新名字')).toBe(3);
  });

  it('没有匹配返回 undefined', () => {
    expect(findGroupIdForCategory([{ id: 1, title: 'A' }], {}, 'B')).toBeUndefined();
    expect(findGroupIdForCategory([], {}, 'A')).toBeUndefined();
  });
});
