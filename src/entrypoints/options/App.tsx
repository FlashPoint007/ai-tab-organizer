import { useCallback, useEffect, useMemo, useState } from 'react';

import { sendRequest } from '@/lib/messaging/client';
import type { DomainRule } from '@/lib/settings/types';

type RuleMatchType = DomainRule['matchType'];

const btn =
  'rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300 transition hover:border-neutral-600 hover:text-white disabled:opacity-40 disabled:hover:border-neutral-800 disabled:hover:text-neutral-300';
const input =
  'rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-sm outline-none placeholder:text-neutral-600 focus:border-emerald-700';

export default function App() {
  const [rules, setRules] = useState<DomainRule[] | null>(null);
  const [categories, setCategories] = useState<string[] | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [draft, setDraft] = useState<{ pattern: string; matchType: RuleMatchType; category: string }>({
    pattern: '',
    matchType: 'domain',
    category: '',
  });
  const [error, setError] = useState<string | null>(null);

  const fail = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [r, c] = await Promise.all([
          sendRequest<DomainRule[]>({ type: 'listRules' }),
          sendRequest<string[]>({ type: 'listCategories' }),
        ]);
        setRules(r);
        setCategories(c);
      } catch (e) {
        fail(e);
      }
    })();
  }, [fail]);

  const saveRules = useCallback(
    async (next: DomainRule[]) => {
      setRules(next); // 乐观更新
      try {
        await sendRequest({ type: 'saveRules', rules: next });
      } catch (e) {
        fail(e);
      }
    },
    [fail],
  );

  const saveCategories = useCallback(
    async (next: string[]) => {
      setCategories(next);
      try {
        await sendRequest({ type: 'saveCategories', categories: next });
      } catch (e) {
        fail(e);
      }
    },
    [fail],
  );

  const usageCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const rule of rules ?? []) {
      counts.set(rule.category, (counts.get(rule.category) ?? 0) + 1);
    }
    return counts;
  }, [rules]);

  function addCategory(): void {
    const name = newCategory.trim();
    if (!name) return;
    if ((categories ?? []).includes(name)) {
      setError('分类已存在');
      return;
    }
    setNewCategory('');
    void saveCategories([...(categories ?? []), name]);
  }

  function removeCategory(name: string): void {
    const used = usageCount.get(name) ?? 0;
    if (used > 0) {
      setError(`「${name}」被 ${used} 条规则引用，请先修改或删除这些规则`);
      return;
    }
    void saveCategories((categories ?? []).filter((c) => c !== name));
  }

  function addRule(): void {
    const pattern = draft.pattern.trim();
    const category = draft.category.trim();
    if (!pattern || !category) {
      setError('规则内容和类别都不能为空');
      return;
    }
    const rule: DomainRule = {
      id: crypto.randomUUID(),
      matchType: draft.matchType,
      pattern,
      category,
      enabled: true,
    };
    setDraft({ pattern: '', matchType: draft.matchType, category });
    void saveRules([...(rules ?? []), rule]);
  }

  function moveRule(index: number, delta: -1 | 1): void {
    if (!rules) return;
    const target = index + delta;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    void saveRules(next);
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-neutral-950 p-6 pb-16 text-neutral-100">
      <h1 className="text-xl font-semibold tracking-tight">AI Tab Organizer · 设置</h1>
      <p className="mt-1 text-sm text-neutral-400">
        规则引擎（M2）：本地匹配、离线可用；LLM 自动分类将在 M3 接入。
      </p>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          <span className="flex-1">{error}</span>
          <button type="button" className="text-red-400 hover:text-red-200" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}

      {/* 分类管理 */}
      <section className="mt-6">
        <h2 className="text-base font-semibold">分类管理</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(categories ?? []).map((name) => {
            const used = usageCount.get(name) ?? 0;
            return (
              <span
                key={name}
                title={used > 0 ? `被 ${used} 条规则引用，不能删除` : '点击 × 删除'}
                className="flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900 py-1 pl-3 pr-1.5 text-xs"
              >
                {name}
                {used > 0 && <span className="text-[10px] text-neutral-500">×{used}</span>}
                <button
                  type="button"
                  disabled={used > 0}
                  onClick={() => removeCategory(name)}
                  className="rounded-full px-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addCategory();
            }}
            placeholder="新增分类名称"
            className={input + ' w-56'}
          />
          <button type="button" className={btn} onClick={addCategory}>
            添加分类
          </button>
        </div>
      </section>

      {/* 规则编辑器 */}
      <section className="mt-8">
        <h2 className="text-base font-semibold">分组规则</h2>
        <p className="mt-1 text-xs leading-relaxed text-neutral-500">
          从上到下依次匹配，先命中先生效（可用 ↑↓ 调整优先级）。
          域名规则匹配主域及其全部子域；关键词规则匹配标题或网址的子串。
          「按类别分组」时使用这里的规则。
        </p>

        <ul className="mt-3 space-y-2">
          {(rules ?? []).map((rule, i) => (
            <li
              key={rule.id}
              className={
                'flex items-center gap-2 rounded-lg border p-2.5 ' +
                (rule.enabled
                  ? 'border-neutral-800 bg-neutral-900'
                  : 'border-neutral-800/60 bg-neutral-900/40 opacity-60')
              }
            >
              <input
                type="checkbox"
                className="accent-emerald-600"
                checked={rule.enabled}
                title={rule.enabled ? '点击禁用' : '点击启用'}
                onChange={() =>
                  void saveRules((rules ?? []).map((rr) => (rr.id === rule.id ? { ...rr, enabled: !rr.enabled } : rr)))
                }
              />
              <span className="w-14 shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-center text-[10px] text-neutral-400">
                {rule.matchType === 'domain' ? '域名' : '关键词'}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-neutral-200" title={rule.pattern}>
                {rule.pattern}
              </span>
              <span className="shrink-0 text-xs text-neutral-500">→</span>
              <select
                value={rule.category}
                onChange={(e) => {
                  const category = e.target.value;
                  if (!category) return;
                  void saveRules((rules ?? []).map((rr) => (rr.id === rule.id ? { ...rr, category } : rr)));
                }}
                className="w-28 shrink-0 rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-xs outline-none focus:border-emerald-700"
              >
                {[...new Set([rule.category, ...(categories ?? [])])].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  className={btn + ' !px-1.5'}
                  disabled={i === 0}
                  onClick={() => moveRule(i, -1)}
                  title="上移（提高优先级）"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={btn + ' !px-1.5'}
                  disabled={!rules || i >= rules.length - 1}
                  onClick={() => moveRule(i, 1)}
                  title="下移（降低优先级）"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={btn + ' hover:!text-red-400'}
                  onClick={() => void saveRules((rules ?? []).filter((rr) => rr.id !== rule.id))}
                >
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>

        {/* 新增规则 */}
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-neutral-800 p-3">
          <select
            value={draft.matchType}
            onChange={(e) => setDraft({ ...draft, matchType: e.target.value as RuleMatchType })}
            className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs outline-none focus:border-emerald-700"
          >
            <option value="domain">域名</option>
            <option value="keyword">关键词</option>
          </select>
          <input
            value={draft.pattern}
            onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}
            placeholder={draft.matchType === 'domain' ? '如 github.com' : '如 论文、arxiv'}
            className={input + ' min-w-0 flex-1'}
          />
          <span className="text-xs text-neutral-500">→</span>
          <input
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            list="category-options"
            placeholder="类别"
            className={input + ' w-32'}
          />
          <datalist id="category-options">
            {(categories ?? []).map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <button type="button" className={btn + ' !border-emerald-700 !text-emerald-400'} onClick={addRule}>
            添加规则
          </button>
        </div>
      </section>
    </main>
  );
}
