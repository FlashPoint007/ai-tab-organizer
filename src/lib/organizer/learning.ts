/**
 * 分类记忆（M6）：把用户在预览弹层里的手动调整沉淀为域名规则。
 * 纯函数，便于单测；去重/更新/插入策略集中在这里。
 *
 * 插入策略（关键）：规则引擎按数组顺序先匹配先赢——
 * - 修正主机与既有规则完全一致 → 原地更新类别；
 * - 修正主机是某既有规则的子域 → 新规则插到那条宽泛规则**前面**（更具体者优先），否则永远不生效；
 * - 其他 → 追加到末尾（不干扰用户手工排序）。
 */
import type { DomainRule } from '../settings/types';
import { normalizeDomainPattern } from './rules';

export interface Correction {
  url: string;
  category: string;
}

export interface LearnOutcome {
  rules: DomainRule[];
  /** 新增的规则数 */
  added: number;
  /** 更新的既有规则数 */
  updated: number;
}

function hostOf(url: string): string {
  try {
    return normalizeDomainPattern(new URL(url).hostname);
  } catch {
    return '';
  }
}

/**
 * 把修正合并进既有规则：
 * - 同主机已有域名规则 → 只改类别（保留优先级位置与启停状态）
 * - 子域修正 → 新规则插到对应宽泛规则之前
 * - 同一批修正里同主机多条 → 以最后一条为准
 */
export function mergeLearnedRules(
  existing: DomainRule[],
  corrections: Correction[],
  newId: () => string,
): LearnOutcome {
  // 同主机去重（后出现的覆盖）
  const byHost = new Map<string, string>();
  for (const correction of corrections) {
    const host = hostOf(correction.url);
    if (!host || !correction.category.trim()) continue;
    byHost.set(host, correction.category.trim());
  }

  const rules = existing.map((rule) => ({ ...rule }));
  let added = 0;
  let updated = 0;

  for (const [host, category] of byHost) {
    const exactIndex = rules.findIndex(
      (rule) => rule.matchType === 'domain' && normalizeDomainPattern(rule.pattern) === host,
    );
    if (exactIndex !== -1) {
      const target = rules[exactIndex];
      if (target && target.category !== category) {
        target.category = category;
        updated += 1;
      }
      continue;
    }

    const newRule: DomainRule = {
      id: newId(),
      matchType: 'domain',
      pattern: host,
      category,
      enabled: true,
    };

    // 子域：插到能覆盖它的宽泛域名规则之前，保证更具体者优先
    const broaderIndex = rules.findIndex((rule) => {
      if (rule.matchType !== 'domain') return false;
      const pattern = normalizeDomainPattern(rule.pattern);
      return pattern !== '' && host.endsWith('.' + pattern);
    });
    if (broaderIndex !== -1) {
      rules.splice(broaderIndex, 0, newRule);
    } else {
      rules.push(newRule);
    }
    added += 1;
  }

  return { rules, added, updated };
}
