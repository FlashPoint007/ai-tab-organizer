/**
 * 备份文件（JSON）解析与构造。
 * 导入采用「文件里有什么就恢复什么」的语义：缺失字段保持当前设置不变。
 */
import { z } from 'zod';

import { domainRuleSchema, llmConfigSchema } from '../messaging/protocol';

export const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().optional(),
  settings: z.object({
    rules: z.array(domainRuleSchema).max(500).default([]),
    categories: z.array(z.string().min(1).max(30)).max(100).default([]),
    minGroupSizeForRules: z.number().int().min(1).max(50).optional(),
    autoApply: z.boolean().optional(),
    autoOrganize: z
      .object({
        mode: z.enum(['off', 'interval', 'threshold']),
        intervalMinutes: z.number().int().min(5).max(1440),
        thresholdCount: z.number().int().min(2).max(200),
      })
      .optional(),
    language: z.enum(['zh', 'en']).optional(),
    realtime: z.boolean().optional(),
    collapsedTitleMode: z.enum(['hide', 'abbreviate', 'keep']).optional(),
    llm: llmConfigSchema.nullable().optional(),
  }),
});

export type BackupFile = z.infer<typeof backupSchema>;

export class BackupParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupParseError';
  }
}

/** 解析备份文本；格式不合法时抛出带中文原因的 BackupParseError。 */
export function parseBackupText(text: string): BackupFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupParseError('文件不是合法的 JSON');
  }
  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path?.length ? first.path.join('.') : '结构';
    throw new BackupParseError(`备份文件不合规：${where} ${first?.message ?? ''}`);
  }
  return parsed.data;
}

export function buildBackupFileName(now = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `ai-tab-organizer-backup-${date}-${time}.json`;
}
