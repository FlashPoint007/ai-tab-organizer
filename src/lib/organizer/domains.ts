/** 域名解析：分组名与清理逻辑共用的纯函数。 */

/** 仅 http(s) 页面参与自动分组 / 清理。 */
export function isWebUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * 由 URL 推导分组名：
 * - http/https：hostname 去掉 www. 前缀（如 news.example.com）
 * - 其它协议返回空串（内部页不参与分组）
 * - 解析失败返回空串
 */
export function parseGroupName(url: string): string {
  if (!isWebUrl(url)) return '';
  try {
    const { hostname } = new URL(url);
    return hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}
