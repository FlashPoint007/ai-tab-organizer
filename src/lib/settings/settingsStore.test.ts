import { describe, expect, it } from 'vitest';

import { MemoryKV } from '../storage/kv';
import { DEFAULT_SETTINGS } from './types';
import { loadSettings, makeDraftRule, saveSettings } from './settingsStore';
import type { Settings } from './types';

describe('settingsStore', () => {
  it('空存储时返回默认设置', async () => {
    const kv = new MemoryKV();
    expect(await loadSettings(kv)).toEqual(DEFAULT_SETTINGS);
  });

  it('保存后可原样读回', async () => {
    const kv = new MemoryKV();
    const settings: Settings = {
      rules: [{ id: 'r1', matchType: 'domain', pattern: 'github.com', category: '开发工具', enabled: true }],
      categories: ['开发工具'],
      minGroupSizeForRules: 2,
      llm: null,
      llmBatch: { size: 10, concurrency: 1, timeoutMs: 5000 },
      autoApply: false,
      autoOrganize: { mode: 'interval' as const, intervalMinutes: 30, thresholdCount: 8 },
      language: 'zh' as const,
    };
    await saveSettings(settings, kv);
    expect(await loadSettings(kv)).toEqual(settings);
  });

  it('部分字段缺失时用默认值补齐（向前兼容）', async () => {
    const kv = new MemoryKV();
    await kv.set('settings:v1', { minGroupSizeForRules: 3 });
    const loaded = await loadSettings(kv);
    expect(loaded.minGroupSizeForRules).toBe(3);
    expect(loaded.categories).toEqual(DEFAULT_SETTINGS.categories);
    expect(loaded.rules).toEqual([]);
  });

  it('makeDraftRule 生成唯一 id 且默认启用', () => {
    const a = makeDraftRule();
    const b = makeDraftRule();
    expect(a.id).not.toBe(b.id);
    expect(a.enabled).toBe(true);
  });
});
