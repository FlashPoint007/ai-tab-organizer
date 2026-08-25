import { describe, expect, it } from 'vitest';

import { makeTranslator, translate } from './index';
import type { MessageKey } from './index';

describe('i18n', () => {
  it('插值变量被替换', () => {
    expect(translate('zh', 'tabCount', { count: 3 })).toBe('3 个标签');
    expect(translate('en', 'tabCount', { count: 3 })).toBe('3 tabs');
  });

  it('缺失变量保留占位符而不抛错', () => {
    expect(translate('zh', 'statusClosedN')).toContain('{count}');
  });

  it('常用 key 在两种语言下都非空且 en 不是中文原文', () => {
    const zhT = makeTranslator('zh');
    const enT = makeTranslator('en');
    const keys: MessageKey[] = [
      // 注意：品牌名 appName 双语相同，不在此列
      'aiOrganize',
      'groupByDomain',
      'cleanupDuplicates',
      'snapshots',
      'previewTitle',
      'applyPlan',
      'sectionAiModel',
      'authorizeAndSave',
      'autoApplyLabel',
      'errNoModel',
    ];
    for (const key of keys) {
      expect(zhT(key).length).toBeGreaterThan(0);
      expect(enT(key).length).toBeGreaterThan(0);
      expect(enT(key)).not.toBe(zhT(key));
    }
  });
});
