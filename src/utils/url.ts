/**
 * URL 归一化与分类缓存键。
 *
 * M2 的 categoryCache 将以「归一化 URL 的哈希」为键存储 LLM 分类结果，
 * 避免同一页面的不同 utm 参数重复消耗 token。
 */

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gclid',
  'fbclid',
  'msclkid',
  'dclid',
  'twclid',
  'igshid',
  'spm',
  'share_token',
]);

/**
 * 归一化 URL：
 * - 仅接受 http/https（chrome:// 等内部页返回 ''，调用方应跳过）
 * - 去掉 hash；去掉跟踪参数；其余 query 原样保留
 * - host 转小写并去 www. 前缀
 * - 去掉路径末尾斜杠（根路径除外）
 */
export function normalizeUrlForCache(rawUrl: string): string {
  if (!rawUrl) return '';

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return '';
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';

  url.hash = '';
  const host = url.host.toLowerCase().replace(/^www\./, '');

  // 先删跟踪参数再整体序列化：URLSearchParams.toString() 会保留 %XX / + 等原始编码
  const params = url.searchParams;
  for (const key of [...params.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) params.delete(key);
  }
  const qs = params.toString();
  const search = qs ? `?${qs}` : '';

  let pathname = url.pathname;
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  return `${url.protocol}//${host}${pathname}${search}`;
}

/** 归一化 URL 的 SHA-256 十六进制摘要，作为分类缓存键；不可归一化时返回 ''。 */
export async function cacheKeyFor(rawUrl: string): Promise<string> {
  const normalized = normalizeUrlForCache(rawUrl);
  if (!normalized) return '';

  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
