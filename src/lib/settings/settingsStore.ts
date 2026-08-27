/**
 * 设置存取：业务层必须显式注入 KVStorage（保持核心可单测），
 * 后台运行时传 localKV。
 */
import type { KVStorage } from '../storage/kv';
import type { AutoOrganizeConfig, Settings } from './types';
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
      typeof stored.minGroupSizeForRules === 'number'
        ? Math.max(2, stored.minGroupSizeForRules)
        : DEFAULT_SETTINGS.minGroupSizeForRules,
    llm: stored.llm && typeof stored.llm.baseUrl === 'string' && typeof stored.llm.model === 'string'
      ? stored.llm
      : DEFAULT_SETTINGS.llm,
    llmBatch:
      stored.llmBatch &&
      typeof stored.llmBatch.size === 'number' &&
      typeof stored.llmBatch.concurrency === 'number' &&
      typeof stored.llmBatch.timeoutMs === 'number'
        ? stored.llmBatch
        : { ...DEFAULT_SETTINGS.llmBatch },
    autoApply: typeof stored.autoApply === 'boolean' ? stored.autoApply : DEFAULT_SETTINGS.autoApply,
    autoOrganize:
      stored.autoOrganize && typeof stored.autoOrganize.mode === 'string'
        ? {
            mode: stored.autoOrganize.mode as AutoOrganizeConfig['mode'],
            intervalMinutes:
              typeof stored.autoOrganize.intervalMinutes === 'number'
                ? Math.max(5, stored.autoOrganize.intervalMinutes)
                : DEFAULT_SETTINGS.autoOrganize.intervalMinutes,
            thresholdCount:
              typeof stored.autoOrganize.thresholdCount === 'number'
                ? Math.max(2, stored.autoOrganize.thresholdCount)
                : DEFAULT_SETTINGS.autoOrganize.thresholdCount,
          }
        : { ...DEFAULT_SETTINGS.autoOrganize },
    language: stored.language === 'en' ? 'en' : 'zh',
    realtime: typeof stored.realtime === 'boolean' ? stored.realtime : DEFAULT_SETTINGS.realtime,
    collapsedTitleMode:
      stored.collapsedTitleMode === 'hide' ||
      stored.collapsedTitleMode === 'abbreviate' ||
      stored.collapsedTitleMode === 'keep'
        ? stored.collapsedTitleMode
        : DEFAULT_SETTINGS.collapsedTitleMode,
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
