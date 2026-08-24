/**
 * 设置存取：业务层必须显式注入 KVStorage（保持核心可单测），
 * 后台运行时传 localKV。
 */
import type { KVStorage } from '../storage/kv';
import type { Settings } from './types';
import { DEFAULT_SETTINGS } from './types';

const SETTINGS_KEY = 'settings:v1';

function newRuleId(): string {
  return crypto.randomUUID();
}

/** 读取设置；缺失字段用默认值补齐（浅合并，向前兼容）。 */
export async function loadSettings(kv: KVStorage): Promise<Settings> {
  const stored = (await kv.get<Partial<Settings>>(SETTINGS_KEY)) ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    rules: Array.isArray(stored.rules) ? stored.rules : [...DEFAULT_SETTINGS.rules],
    categories:
      Array.isArray(stored.categories) && stored.categories.length > 0
        ? [...stored.categories]
        : [...DEFAULT_SETTINGS.categories],
    minGroupSizeForRules:
      typeof stored.minGroupSizeForRules === 'number' && stored.minGroupSizeForRules >= 1
        ? stored.minGroupSizeForRules
        : DEFAULT_SETTINGS.minGroupSizeForRules,
  };
}

export async function saveSettings(settings: Settings, kv: KVStorage): Promise<void> {
  await kv.set(SETTINGS_KEY, settings);
}

/** 生成新规则的工厂：默认启用、追加到末尾（最低优先级）。 */
export function makeDraftRule(partial?: Partial<{ pattern: string; category: string; matchType: 'domain' | 'keyword' }>): {
  id: string;
  matchType: 'domain' | 'keyword';
  pattern: string;
  category: string;
  enabled: boolean;
} {
  return {
    id: newRuleId(),
    matchType: partial?.matchType ?? 'domain',
    pattern: partial?.pattern ?? '',
    category: partial?.category ?? '',
    enabled: true,
  };
}
