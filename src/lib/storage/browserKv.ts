/** KVStorage 的浏览器实现（仅后台/UI 运行时导入，避免单测环境引入扩展 API）。 */
import { browser } from 'wxt/browser';

import type { KVStorage } from './kv';

function fromArea(area: typeof browser.storage.local): KVStorage {
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const record = await area.get(key);
      return record[key] as T | undefined;
    },
    async set(key: string, value: unknown): Promise<void> {
      await area.set({ [key]: value });
    },
    async remove(key: string): Promise<void> {
      await area.remove(key);
    },
  };
}

/** 持久存储：设置、快照。 */
export const localKV: KVStorage = fromArea(browser.storage.local);

/** 会话级存储：SW 休眠后仍可恢复，浏览器关闭即清空 —— 用于 TabRegistry。 */
export const sessionKV: KVStorage = fromArea(browser.storage.session);
