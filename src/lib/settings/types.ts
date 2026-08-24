/** 用户设置领域模型：M2 规则引擎 + M3 LLM 分类。 */

export type RuleMatchType = 'domain' | 'keyword';

/** OpenAI 兼容端点的连接配置（本地模型 apiKey 可为空）。 */
export interface LlmProviderConfig {
  /** 预设 id 或 'custom' */
  preset: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface DomainRule {
  id: string;
  /** domain=按主机名（含子域）；keyword=标题或网址的子串 */
  matchType: RuleMatchType;
  /** domain: 如 github.com；keyword: 大小写不敏感子串 */
  pattern: string;
  category: string;
  enabled: boolean;
}

export interface BatchConfig {
  size: number;
  concurrency: number;
  timeoutMs: number;
}

export interface Settings {
  /** 规则数组顺序即优先级：先匹配先赢 */
  rules: DomainRule[];
  categories: string[];
  /** 按类别分组时，同类标签数达到该值才成组 */
  minGroupSizeForRules: number;
  /** M3：LLM 连接配置；null=未配置（AI 整理不可用，走规则兜底） */
  llm: LlmProviderConfig | null;
  llmBatch: BatchConfig;
}

export const DEFAULT_CATEGORIES: readonly string[] = [
  '开发工具',
  '设计创意',
  '学习资料',
  '办公效率',
  '新闻资讯',
  '社交社区',
  '购物消费',
  '娱乐影音',
  '金融财经',
  '生活服务',
];

export const DEFAULT_SETTINGS: Settings = {
  rules: [],
  categories: [...DEFAULT_CATEGORIES],
  minGroupSizeForRules: 1,
  llm: null,
  llmBatch: { size: 30, concurrency: 2, timeoutMs: 30_000 },
};
