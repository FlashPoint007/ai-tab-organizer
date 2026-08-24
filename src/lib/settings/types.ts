/** 用户设置领域模型：M2 的规则引擎与分类清单。 */

export type RuleMatchType = 'domain' | 'keyword';

export interface DomainRule {
  id: string;
  /** domain=按主机名（含子域）；keyword=标题或网址的子串 */
  matchType: RuleMatchType;
  /** domain: 如 github.com；keyword: 大小写不敏感子串 */
  pattern: string;
  category: string;
  enabled: boolean;
}

export interface Settings {
  /** 规则数组顺序即优先级：先匹配先赢 */
  rules: DomainRule[];
  categories: string[];
  /** 按类别分组时，同类标签数达到该值才成组 */
  minGroupSizeForRules: number;
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
};
