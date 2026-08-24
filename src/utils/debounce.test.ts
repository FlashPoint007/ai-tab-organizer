import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { debounce } from './debounce';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('debounce', () => {
  it('等待期内的多次调用合并为一次尾触发', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);

    d('a');
    vi.advanceTimersByTime(50);
    d('b');
    vi.advanceTimersByTime(50);
    d('c');
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('cancel 后不再触发', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);

    d('x');
    d.cancel();
    vi.advanceTimersByTime(500);

    expect(fn).not.toHaveBeenCalled();
  });

  it('触发后可再次调度', () => {
    const fn = vi.fn();
    const d = debounce(fn, 10);

    d(1);
    vi.advanceTimersByTime(10);
    d(2);
    vi.advanceTimersByTime(10);

    expect(fn).toHaveBeenCalledTimes(2);
  });
});
