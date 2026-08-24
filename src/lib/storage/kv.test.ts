import { describe, expect, it } from 'vitest';

import { MemoryKV } from './kv';

describe('MemoryKV', () => {
  it('set/get/remove 基本语义', async () => {
    const kv = new MemoryKV();
    expect(await kv.get('k')).toBeUndefined();

    await kv.set('k', { a: 1 });
    expect(await kv.get<{ a: number }>('k')).toEqual({ a: 1 });

    await kv.remove('k');
    expect(await kv.get('k')).toBeUndefined();
  });

  it('set 会深拷贝，后续修改不影响已存值', async () => {
    const kv = new MemoryKV();
    const value = { list: [1] };
    await kv.set('k', value);
    value.list.push(2);
    expect(await kv.get<{ list: number[] }>('k')).toEqual({ list: [1] });
  });
});
