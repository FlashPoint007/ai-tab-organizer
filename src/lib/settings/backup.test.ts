import { describe, expect, it } from 'vitest';

import { buildBackupFileName, parseBackupText } from './backup';

const validBackup = {
  version: 1,
  exportedAt: '2026-08-25T12:00:00.000Z',
  settings: {
    rules: [{ id: 'r1', matchType: 'domain', pattern: 'github.com', category: '开发工具', enabled: true }],
    categories: ['开发工具'],
    llm: { preset: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  },
};

describe('parseBackupText', () => {
  it('解析合法备份', () => {
    const got = parseBackupText(JSON.stringify(validBackup));
    expect(got.settings.rules).toHaveLength(1);
    expect(got.settings.llm?.model).toBe('deepseek-chat');
  });

  it('rules/categories 缺失时给默认空数组', () => {
    const got = parseBackupText(JSON.stringify({ version: 1, settings: {} }));
    expect(got.settings.rules).toEqual([]);
    expect(got.settings.categories).toEqual([]);
  });

  it('非 JSON 抛 BackupParseError', () => {
    expect(() => parseBackupText('not json')).toThrow(/JSON/);
  });

  it('version 不对或结构缺失抛错', () => {
    expect(() => parseBackupText(JSON.stringify({ version: 2, settings: {} }))).toThrow(/version/);
    expect(() => parseBackupText('{}')).toThrow();
  });

  it('llm.baseUrl 非 http(s) 被拒绝', () => {
    const bad = { version: 1, settings: { llm: { preset: 'x', baseUrl: 'ftp://a', model: 'm' } } };
    expect(() => parseBackupText(JSON.stringify(bad))).toThrow(/baseUrl/);
  });
});

describe('buildBackupFileName', () => {
  it('按日期时间命名', () => {
    const name = buildBackupFileName(new Date(2026, 7, 25, 9, 5));
    expect(name).toBe('ai-tab-organizer-backup-20260825-0905.json');
  });
});
