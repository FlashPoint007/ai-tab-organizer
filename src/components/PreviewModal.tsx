import { useMemo, useState } from 'react';

import { faviconUrl, sendRequest } from '@/lib/messaging/client';
import type { OrganizePlan, PlanEntry } from '@/lib/messaging/protocol';
import type { Translator } from '@/i18n';
import type { TabMeta } from '@/lib/types';

interface PreviewEntry extends PlanEntry {
  title: string;
  url: string;
  included: boolean;
}

interface PreviewModalProps {
  plan: OrganizePlan;
  tabs: TabMeta[];
  categories: string[];
  t: Translator;
  onCancel: () => void;
  onApplied: (r: { groups: number; groupedTabs: number }, learned: number) => void;
  onError: (message: string) => void;
}

export function PreviewModal({ plan, tabs, categories, t, onCancel, onApplied, onError }: PreviewModalProps) {
  const [entries, setEntries] = useState<PreviewEntry[]>(() =>
    plan.assignments.flatMap((a) => {
      const tab = tabs.find((tb) => tb.id === a.tabId);
      if (!tab) return []; // 标签可能已被用户关闭
      return [{ tabId: a.tabId, category: a.category, title: tab.title, url: tab.url, included: true }];
    }),
  );
  const [learn, setLearn] = useState(true);

  /** 用户相对 AI 原方案的类别修正（用于沉淀域名规则）。 */
  function collectCorrections(): Array<{ url: string; category: string }> {
    const original = new Map(plan.assignments.map((a) => [a.tabId, a.category]));
    return entries
      .filter((e) => e.included && original.get(e.tabId) !== e.category)
      .map((e) => ({ url: e.url, category: e.category }));
  }

  const includedCount = entries.filter((e) => e.included).length;

  // 按类别分区展示（区名升序），便于一眼核对
  const sections = useMemo(() => {
    const byCategory = new Map<string, PreviewEntry[]>();
    for (const entry of entries) {
      const bucket = byCategory.get(entry.category);
      if (bucket) bucket.push(entry);
      else byCategory.set(entry.category, [entry]);
    }
    return [...byCategory.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([category, list]) => ({ category, list }));
  }, [entries]);

  function confirm(): void {
    const assignments = entries.filter((e) => e.included).map((e) => ({ tabId: e.tabId, category: e.category }));
    if (assignments.length === 0) return;
    const corrections = learn ? collectCorrections() : [];
    void (async () => {
      try {
        const r = await sendRequest<{ groups: number; groupedTabs: number }>({
          type: 'applyCategoryPlan',
          assignments,
        });
        let learned = 0;
        if (corrections.length > 0) {
          const lr = await sendRequest<{ added: number; updated: number }>({
            type: 'learnFromCorrections',
            corrections,
          });
          learned = lr.added + lr.updated;
        }
        onApplied(r, learned);
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
      }
    })();
  }

  const selectCls =
    'shrink-0 rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-xs outline-none focus:border-emerald-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-neutral-800 p-4">
          <h2 className="text-base font-semibold text-neutral-100">{t('previewTitle')}</h2>
          <p className="mt-1 text-xs leading-relaxed text-neutral-500">{t('previewHint')}</p>
          <p className="mt-1.5 text-[11px] text-neutral-600">
            {t('statsLine', {
              llm: plan.stats.llmAssigned,
              cache: plan.stats.cacheHits,
              rules: plan.stats.ruleFallback,
              failed: plan.stats.batchesFailed,
            })}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {entries.length === 0 && <p className="py-6 text-center text-sm text-neutral-500">{t('previewNoAssignments')}</p>}
          {sections.map((section) => (
            <div key={section.category} className="mb-3">
              <p className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                {section.category} · {section.list.length}
              </p>
              <ul className="space-y-1">
                {section.list.map((entry) => (
                  <li key={entry.tabId} className="flex items-center gap-2 rounded-md bg-neutral-950 px-2 py-1.5">
                    <input
                      type="checkbox"
                      className="accent-emerald-600"
                      checked={entry.included}
                      onChange={() =>
                        setEntries((prev) =>
                          prev.map((e) => (e.tabId === entry.tabId ? { ...e, included: !e.included } : e)),
                        )
                      }
                    />
                    <img
                      src={faviconUrl(entry.url)}
                      alt=""
                      className="h-4 w-4 shrink-0"
                      onError={(e) => {
                        e.currentTarget.style.visibility = 'hidden';
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-neutral-300" title={entry.url}>
                      {entry.title || entry.url}
                    </span>
                    <select
                      value={entry.category}
                      onChange={(ev) => {
                        const category = ev.target.value;
                        setEntries((prev) =>
                          prev.map((it) =>
                            it.tabId === entry.tabId ? { ...it, category, included: true } : it,
                          ),
                        );
                      }}
                      className={selectCls}
                    >
                      {[...new Set([entry.category, ...categories])].map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-neutral-800 p-3">
          <label
            className="mr-auto flex items-center gap-1.5 text-[11px] text-neutral-400"
            title={t('learnCheckbox')}
          >
            <input
              type="checkbox"
              className="accent-emerald-600"
              checked={learn}
              onChange={(e) => setLearn(e.target.checked)}
            />
            {t('learnCheckbox')}
          </label>
          <span className="text-xs text-neutral-400">
            {entries.filter((e) => e.included).length}/{entries.length}
          </span>
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
            onClick={onCancel}
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            disabled={includedCount === 0}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
            onClick={confirm}
          >
            {t('applyPlan', { count: includedCount })}
          </button>
        </div>
      </div>
    </div>
  );
}
