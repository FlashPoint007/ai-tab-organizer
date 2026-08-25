import { describe, expect, it } from 'vitest';

import { eventSchema, parseEvent, requestSchema, tabMetaSchema } from './protocol';

const baseTab = {
  id: 1,
  windowId: 2,
  index: 0,
  title: 'Example',
  url: 'https://example.com',
  pinned: false,
  audible: false,
  muted: false,
  active: true,
  groupId: -1,
};

describe('requestSchema', () => {
  it('解析合法请求并应用默认值', () => {
    const req = requestSchema.parse({ type: 'groupTabsByDomain' });
    expect(req).toMatchObject({ type: 'groupTabsByDomain', minGroupSize: 2 });
  });

  it('拒绝未知类型与缺字段的请求', () => {
    expect(requestSchema.safeParse({ type: 'nope' }).success).toBe(false);
    expect(requestSchema.safeParse({ type: 'closeTabs', tabIds: [] }).success).toBe(false);
    expect(requestSchema.safeParse({ type: 'activateTab' }).success).toBe(false);
  });

  it('tabMetaSchema 拒绝缺少必填字段的载荷', () => {
    expect(tabMetaSchema.safeParse(baseTab).success).toBe(true);
    expect(tabMetaSchema.safeParse({ ...baseTab, id: '1' }).success).toBe(false);
    // zod 对象默认剥离未知字段（宽松接收），这里验证剥离行为
    expect(tabMetaSchema.parse({ ...baseTab, extra: 1 })).toEqual(baseTab);
  });
});

describe('eventSchema / parseEvent', () => {
  it('解析 tabsUpdated 广播', () => {
    const ev = eventSchema.parse({ type: 'tabsUpdated', windowId: 2, tabs: [baseTab] });
    if (ev.type === 'tabsUpdated') {
      expect(ev.tabs).toHaveLength(1);
    } else {
      throw new Error('应解析出 tabsUpdated');
    }
  });

  it('parseEvent 对非事件载荷返回 null 而不是抛错', () => {
    expect(parseEvent({ hello: 1 })).toBeNull();
    expect(parseEvent(null)).toBeNull();
    const ok = parseEvent({ type: 'tabsUpdated', windowId: 1, tabs: [] });
    expect(ok?.type).toBe('tabsUpdated');
  });
});
