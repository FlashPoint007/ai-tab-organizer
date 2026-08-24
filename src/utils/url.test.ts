import { describe, expect, it } from 'vitest';

import { cacheKeyFor, normalizeUrlForCache } from './url';

describe('normalizeUrlForCache', () => {
  it('去除 utm 跟踪参数与 hash', () => {
    const input = 'https://example.com/post?a=1&utm_source=x#top';
    expect(normalizeUrlForCache(input)).toBe('https://example.com/post?a=1');
  });

  it('保留非跟踪参数的顺序与取值', () => {
    const input = 'https://www.example.com/search?q=ai+tabs&lang=zh&utm_medium=rss';
    expect(normalizeUrlForCache(input)).toBe('https://example.com/search?q=ai+tabs&lang=zh');
  });

  it('host 小写化并去掉 www.', () => {
    expect(normalizeUrlForCache('https://WWW.GitHub.COM/flashpoint007')).toBe(
      'https://github.com/flashpoint007',
    );
  });

  it('去掉路径末尾斜杠，但根路径保留', () => {
    expect(normalizeUrlForCache('https://example.com/docs/')).toBe('https://example.com/docs');
    expect(normalizeUrlForCache('https://example.com/')).toBe('https://example.com/');
  });

  it('拒绝非 http(s) 协议（返回空串）', () => {
    expect(normalizeUrlForCache('chrome://extensions')).toBe('');
    expect(normalizeUrlForCache('chrome-extension://abc/popup.html')).toBe('');
    expect(normalizeUrlForCache('ftp://example.com/file')).toBe('');
  });

  it('非法或空输入返回空串', () => {
    expect(normalizeUrlForCache('')).toBe('');
    expect(normalizeUrlForCache('not-a-url')).toBe('');
  });
});

describe('cacheKeyFor', () => {
  it('等价 URL 得到相同缓存键（确定性）', async () => {
    const a = await cacheKeyFor('https://example.com/post?x=1&utm_source=weibo#frag');
    const b = await cacheKeyFor('https://www.example.com/post/?x=1');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('不同页面得到不同缓存键', async () => {
    const a = await cacheKeyFor('https://example.com/a');
    const b = await cacheKeyFor('https://example.com/b');
    expect(a).not.toBe(b);
  });

  it('不可归一化的 URL 返回空串', async () => {
    expect(await cacheKeyFor('chrome://newtab')).toBe('');
    expect(await cacheKeyFor('garbage')).toBe('');
  });
});
