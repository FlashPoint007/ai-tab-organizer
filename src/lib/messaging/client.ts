/** 面板侧的类型化请求客户端。 */
import { browser } from 'wxt/browser';

import { resultSchema } from './protocol';
import type { RequestInput } from './protocol';

/** 发送请求并解包 Result；失败（后台返回错误或协议不合法）时抛错。 */
export async function sendRequest<T = unknown>(req: RequestInput): Promise<T> {
  const raw: unknown = await browser.runtime.sendMessage(req);
  const result = resultSchema.parse(raw);
  if (!result.ok) throw new Error(result.error);
  return result.data as T;
}

/** favicon 服务地址（需要 manifest 的 favicon 权限）。 */
export function faviconUrl(pageUrl: string, size = 16): string {
  return `/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=${size}`;
}
