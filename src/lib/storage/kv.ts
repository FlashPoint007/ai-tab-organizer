/** 存储抽象：业务层依赖此接口，便于单测替换为内存实现。 */

export interface KVStorage {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

/** 测试与纯逻辑用的内存实现。 */
export class MemoryKV implements KVStorage {
  private map = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.map.has(key) ? (this.map.get(key) as T) : undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.map.set(key, structuredClone(value));
  }

  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }
}
