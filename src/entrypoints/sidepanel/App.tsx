import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { browser } from 'wxt/browser';

import { PreviewModal } from '@/components/PreviewModal';
import { SnapshotModal } from '@/components/SnapshotModal';
import { TabRow } from '@/components/TabRow';
import {
  cleanupCandidatesFromClusters,
  findDuplicateTabs,
  findInactiveTabs,
} from '@/lib/organizer/cleanup';
import { computeDomainGroups } from '@/lib/organizer/grouping';
import { filterTabs } from '@/lib/organizer/filtering';
import { sendRequest } from '@/lib/messaging/client';
import type { OrganizePlan } from '@/lib/messaging/protocol';
import { parseEvent } from '@/lib/messaging/protocol';
import type { TabMeta } from '@/lib/types';
import type { UiLanguage } from '@/lib/settings/types';
import { makeTranslator } from '@/i18n';

type ViewMode = 'flat' | 'domain' | 'category';

interface PendingCleanup {
  kind: 'duplicates' | 'inactive';
  tabIds: number[];
}

export default function App() {
  const [tabs, setTabs] = useState<TabMeta[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('flat');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pendingCleanup, setPendingCleanup] = useState<PendingCleanup | null>(null);
  const [showSnapshotModal, setShowSnapshotModal] = useState(false);
  const [previewPlan, setPreviewPlan] = useState<OrganizePlan | null>(null);
  const [groupTitleInput, setGroupTitleInput] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; bad?: boolean } | null>(null);
  const [collapsedDomains, setCollapsedDomains] = useState<Set<string>>(new Set());

  const [locale, setLocale] = useState<UiLanguage>('zh');
  const [autoApply, setAutoApply] = useState(false);
  const [categoriesList, setCategoriesList] = useState<string[]>([]);
  const [organizing, setOrganizing] = useState(false);
  const [groupNames, setGroupNames] = useState<Record<number, string>>({});

  const ownWindowIdRef = useRef<number | undefined>(undefined);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const t = useMemo(() => makeTranslator(locale), [locale]);

  const showStatus = useCallback(
    (text: string, bad = false) => {
      setStatus({ text, bad });
      if (statusTimer.current !== undefined) clearTimeout(statusTimer.current);
      statusTimer.current = setTimeout(() => setStatus(null), 3500);
    },
    [],
  );

  // ---------- 初始加载 + 事件订阅 ----------
  useEffect(() => {
    void (async () => {
      try {
        const win = await browser.windows.getCurrent();
        ownWindowIdRef.current = win.id;
        const [snapshot, ui, cats] = await Promise.all([
          sendRequest<TabMeta[]>({ type: 'getSnapshot' }),
          sendRequest<{ language: UiLanguage; autoApply: boolean }>({ type: 'getUiSettings' }),
          sendRequest<string[]>({ type: 'listCategories' }),
        ]);
        setTabs(snapshot);
        setLocale(ui.language);
        setAutoApply(ui.autoApply);
        setCategoriesList(cats);
      } catch (e) {
        showStatus(e instanceof Error ? e.message : String(e), true);
      } finally {
        setLoaded(true);
      }
    })();

    const listener = (raw: unknown): void => {
      const ev = parseEvent(raw);
      if (!ev) return;
      if (ev.type === 'tabsUpdated' && ev.windowId === ownWindowIdRef.current) {
        setTabs(ev.tabs);
      }
      if (ev.type === 'settingsChanged') {
        setLocale(ev.language);
        setAutoApply(ev.autoApply);
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [showStatus]);

  // 标签消失后修剪选择集
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const alive = new Set(tabs.map((tab) => tab.id));
      const next = new Set([...prev].filter((id) => alive.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [tabs]);

  // 分类视图：查询标签组名（只查缺失的，避免循环刷新）
  const fetchedGroupIds = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (viewMode !== 'category') return;
    const missing = [
      ...new Set(
        tabs.filter((tab) => tab.groupId !== -1 && !fetchedGroupIds.current.has(tab.groupId)).map((tab) => tab.groupId),
      ),
    ];
    if (missing.length === 0) return;
    for (const id of missing) fetchedGroupIds.current.add(id);
    void (async () => {
      const updates: Record<number, string> = {};
      for (const id of missing) {
        try {
          const group = await browser.tabGroups.get(id);
          updates[id] = group.title || t('unnamedGroup');
        } catch {
          updates[id] = t('unnamedGroup');
        }
      }
      setGroupNames((prev) => ({ ...prev, ...updates }));
    })();
  }, [viewMode, tabs, t]);

  // ---------- 派生数据 ----------
  const visibleTabs = useMemo(() => filterTabs(tabs, search), [tabs, search]);

  const duplicateCount = useMemo(
    () => cleanupCandidatesFromClusters(findDuplicateTabs(visibleTabs)).length,
    [visibleTabs],
  );
  const inactiveCount = useMemo(() => findInactiveTabs(visibleTabs).length, [visibleTabs]);

  const categorySections = useMemo(() => {
    if (viewMode !== 'category') return [];
    const byGroup = new Map<string, TabMeta[]>();
    for (const tab of visibleTabs) {
      const label =
        tab.groupId === -1 ? t('ungroupedTabs') : (groupNames[tab.groupId] ?? t('unnamedGroup'));
      const bucket = byGroup.get(label);
      if (bucket) bucket.push(tab);
      else byGroup.set(label, [tab]);
    }
    return [...byGroup.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([label, list]) => ({ key: label, label, tabs: list }));
  }, [viewMode, visibleTabs, groupNames, t]);

  const domainSections = useMemo(() => {
    if (viewMode !== 'domain') return [];
    const groups = computeDomainGroups(visibleTabs, { minGroupSize: 1, includePinned: true });
    const groupedIds = new Set(groups.flatMap((g) => g.tabIds));
    const rest = visibleTabs.filter((tab) => !groupedIds.has(tab.id));
    return [
      ...groups.map((g) => ({ key: g.domain, label: g.domain, tabs: tabsInOrder(g.tabIds) })),
      ...(rest.length > 0
        ? [{ key: '__ungrouped__', label: t('viewFlat'), tabs: tabsInOrder(rest.map((tab) => tab.id)) }]
        : []),
    ];
    function tabsInOrder(ids: number[]): TabMeta[] {
      return ids.map((id) => visibleTabs.find((tab) => tab.id === id)).filter((tb): tb is TabMeta => !!tb);
    }
  }, [viewMode, visibleTabs, t]);

  // ---------- 动作 ----------
  const run = useCallback(
    async (fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (e) {
        showStatus(e instanceof Error ? e.message : String(e), true);
      }
    },
    [showStatus],
  );

  const activate = (tabId: number): void =>
    void run(() => sendRequest({ type: 'activateTab', tabId }).then(() => undefined));
  const closeOne = (tabId: number): void =>
    void run(async () => {
      await sendRequest({ type: 'closeTabs', tabIds: [tabId] });
    });
  const togglePin = (tab: TabMeta): void =>
    void run(() =>
      sendRequest({ type: 'setPinned', tabIds: [tab.id], pinned: !tab.pinned }).then(() => undefined),
    );
  const toggleMute = (tab: TabMeta): void =>
    void run(() =>
      sendRequest({ type: 'setMuted', tabIds: [tab.id], muted: !tab.muted }).then(() => undefined),
    );

  const toggleChecked = (tabId: number): void =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tabId)) next.delete(tabId);
      else next.add(tabId);
      return next;
    });

  const bulkAction = (
    action: 'closeTabs' | 'setPinned' | 'setMuted',
    extra?: { pinned?: boolean; muted?: boolean },
  ): void => {
    if (selected.size === 0) return;
    const tabIds = [...selected];
    void run(async () => {
      if (action === 'closeTabs') {
        const r = await sendRequest<{ closed: number }>({ type: 'closeTabs', tabIds });
        showStatus(t('statusClosedN', { count: r.closed }));
      } else if (action === 'setPinned') {
        await sendRequest({ type: 'setPinned', tabIds, pinned: extra?.pinned ?? true });
      } else {
        await sendRequest({ type: 'setMuted', tabIds, muted: extra?.muted ?? true });
      }
      setSelected(new Set());
    });
  };

  const createGroupFromSelection = (): void => {
    const title = (groupTitleInput ?? '').trim();
    if (!title || selected.size === 0) return;
    void run(async () => {
      await sendRequest({ type: 'createGroupFromSelection', tabIds: [...selected], title });
      showStatus(t('statusGroupCreated', { name: title }));
      setGroupTitleInput(null);
      setSelected(new Set());
    });
  };

  const groupByDomain = (): void =>
    void run(async () => {
      const r = await sendRequest<{ groups: number; groupedTabs: number }>({
        type: 'groupTabsByDomain',
        minGroupSize: 2,
      });
      showStatus(t('statusGroupedByDomain', { groups: r.groups, tabs: r.groupedTabs }));
    });

  const groupByRules = (): void =>
    void run(async () => {
      const r = await sendRequest<{ groups: number; groupedTabs: number; unmatched: number }>({
        type: 'groupTabsByRules',
      });
      const extra = r.unmatched > 0 ? '，' + t('statusUnmatched', { count: r.unmatched }) : '';
      showStatus(t('statusGroupedByCategory', { groups: r.groups, tabs: r.groupedTabs, extra }));
    });

  const sortByDomain = (): void =>
    void run(async () => {
      const r = await sendRequest<{ moved: number }>({ type: 'sortTabsByDomain' });
      showStatus(t('statusSorted', { count: r.moved }));
    });

  const organizeByLlm = (): void => {
    if (organizing) return;
    setOrganizing(true);
    void run(async () => {
      try {
        if (autoApply) {
          // 跳过预览：直接应用
          const r = await sendRequest<{
            groups: number;
            groupedTabs: number;
            cacheHits: number;
            ruleFallback: number;
            batchesFailed: number;
            totalTokens: number;
            newCategories: string[];
          }>({ type: 'organizeByLlm' });
          const parts = [
            t('statusAiGrouped', { grouped: r.groupedTabs, groups: r.groups }),
            r.cacheHits > 0 ? t('statusCacheHits', { count: r.cacheHits }) : '',
            r.totalTokens > 0 ? t('statusTokens', { count: r.totalTokens }) : '',
            r.ruleFallback > 0 ? t('statusRuleFallback', { count: r.ruleFallback }) : '',
            r.batchesFailed > 0 ? t('statusBatchesDegraded', { count: r.batchesFailed }) : '',
          ].filter(Boolean);
          if (r.newCategories.length > 0) {
            parts.push(t('statusNewCategories', { count: r.newCategories.length, names: r.newCategories.join('、') }));
          }
          showStatus(parts.join('，'));
          // 侧边栏同步：切到分类视图
          setViewMode('category');
        } else {
          // 预览确认流
          const plan = await sendRequest<OrganizePlan>({ type: 'planOrganizeByLlm' });
          // AI 新归纳的类别并入下拉选项，预览里可以选到
          setCategoriesList((prev) => [...new Set([...prev, ...plan.newCategories])]);
          setPreviewPlan(plan);
        }
      } finally {
        setOrganizing(false);
      }
    });
  };

  const askCleanup = (kind: PendingCleanup['kind']): void => {
    const ids =
      kind === 'duplicates'
        ? cleanupCandidatesFromClusters(findDuplicateTabs(visibleTabs))
        : findInactiveTabs(visibleTabs);
    if (ids.length === 0) {
      showStatus(t('statusNothingToClean'), true);
      return;
    }
    setPendingCleanup({ kind, tabIds: ids });
  };

  const executeCleanup = (): void => {
    if (!pendingCleanup) return;
    const type = pendingCleanup.kind === 'duplicates' ? ('cleanupDuplicates' as const) : ('cleanupInactive' as const);
    setPendingCleanup(null);
    void run(async () => {
      const r = await sendRequest<{ closed: number; snapshotId: string }>({ type });
      showStatus(
        r.closed > 0 ? t('statusCleanedWithSnapshot', { count: r.closed }) : t('statusNothingToClean'),
      );
    });
  };

  // ---------- 渲染 ----------
  const toolbarBtn =
    'rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300 transition hover:border-neutral-600 hover:text-white disabled:opacity-40';

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      {/* 头部 */}
      <header className="border-b border-neutral-800 px-3 py-2">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-semibold tracking-tight">{t('appName')}</h1>
          <div className="flex items-center gap-1 text-xs">
            <button
              type="button"
              className={`${toolbarBtn} ${viewMode === 'flat' ? '!border-emerald-700 !text-emerald-400' : ''}`}
              onClick={() => setViewMode('flat')}
            >
              {t('viewFlat')}
            </button>
            <button
              type="button"
              className={`${toolbarBtn} ${viewMode === 'domain' ? '!border-emerald-700 !text-emerald-400' : ''}`}
              onClick={() => setViewMode('domain')}
            >
              {t('viewDomain')}
            </button>
            <button
              type="button"
              className={`${toolbarBtn} ${viewMode === 'category' ? '!border-emerald-700 !text-emerald-400' : ''}`}
              onClick={() => setViewMode('category')}
            >
              {t('viewCategory')}
            </button>
          </div>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-sm outline-none placeholder:text-neutral-600 focus:border-emerald-700"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={organizing}
            onClick={organizeByLlm}
            className="rounded-md bg-emerald-700 px-3 py-1 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
          >
            {organizing ? t('aiOrganizing') : t('aiOrganize')}
          </button>
          <button type="button" className={toolbarBtn} onClick={groupByDomain}>
            {t('groupByDomain')}
          </button>
          <button type="button" className={toolbarBtn} onClick={groupByRules}>
            {t('groupByCategory')}
          </button>
          <button type="button" className={toolbarBtn} onClick={sortByDomain}>
            {t('sortByDomain')}
          </button>
          <button type="button" className={toolbarBtn} onClick={() => askCleanup('duplicates')}>
            {t('cleanupDuplicates')}
            {duplicateCount > 0 ? `(${duplicateCount})` : ''}
          </button>
          <button type="button" className={toolbarBtn} onClick={() => askCleanup('inactive')}>
            {t('cleanupInactive')}
            {inactiveCount > 0 ? `(${inactiveCount})` : ''}
          </button>
          <button type="button" className={toolbarBtn} onClick={() => setShowSnapshotModal(true)}>
            {t('snapshots')}
          </button>
        </div>
      </header>

      {/* 两步确认条 */}
      {pendingCleanup && (
        <div className="flex items-center gap-2 border-b border-amber-900/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
          <span className="flex-1">{t('confirmCloseN', { count: pendingCleanup.tabIds.length })}</span>
          <button
            type="button"
            className="rounded bg-amber-700 px-2 py-1 font-medium text-white hover:bg-amber-600"
            onClick={executeCleanup}
          >
            {t('confirmClose')}
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-amber-300 hover:bg-neutral-800"
            onClick={() => setPendingCleanup(null)}
          >
            {t('cancel')}
          </button>
        </div>
      )}

      {/* 列表 */}
      <main className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {!loaded && <p className="p-4 text-sm text-neutral-500">{t('loading')}</p>}
        {loaded && visibleTabs.length === 0 && (
          <p className="p-4 text-center text-sm text-neutral-500">
            {search ? t('noMatchingTabs') : t('noTabs')}
          </p>
        )}

        {viewMode === 'flat' &&
          visibleTabs.map((tab) => (
            <TabRow
              key={tab.id}
              tab={tab}
              checked={selected.has(tab.id)}
              t={t}
              onToggleChecked={toggleChecked}
              onActivate={activate}
              onClose={closeOne}
              onTogglePin={togglePin}
              onToggleMute={toggleMute}
            />
          ))}

        {viewMode === 'domain' &&
          domainSections.map((section) => {
            const collapsed = collapsedDomains.has(section.key);
            return (
              <section key={section.key} className="mb-1">
                <button
                  type="button"
                  className="flex w-full items-center gap-1 rounded px-2 py-0.5 text-[10px] leading-4 text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
                  onClick={() =>
                    setCollapsedDomains((prev) => {
                      const next = new Set(prev);
                      if (next.has(section.key)) next.delete(section.key);
                      else next.add(section.key);
                      return next;
                    })
                  }
                >
                  <span>{collapsed ? '▸' : '▾'}</span>
                  <span className="truncate font-medium">{section.label}</span>
                  <span className="text-neutral-600">{section.tabs.length}</span>
                </button>
                {!collapsed &&
                  section.tabs.map((tab) => (
                    <TabRow
                      key={tab.id}
                      tab={tab}
                      checked={selected.has(tab.id)}
                      t={t}
                      onToggleChecked={toggleChecked}
                      onActivate={activate}
                      onClose={closeOne}
                      onTogglePin={togglePin}
                      onToggleMute={toggleMute}
                    />
                  ))}
              </section>
            );
          })}

        {viewMode === 'category' &&
          categorySections.map((section) => {
            const collapsed = collapsedDomains.has('cat:' + section.key);
            return (
              <section key={section.key} className="mb-1">
                <button
                  type="button"
                  className="flex w-full items-center gap-1 rounded px-2 py-0.5 text-[10px] leading-4 text-emerald-400/80 hover:bg-neutral-900 hover:text-emerald-300"
                  onClick={() =>
                    setCollapsedDomains((prev) => {
                      const next = new Set(prev);
                      const key = 'cat:' + section.key;
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                >
                  <span>{collapsed ? '▸' : '▾'}</span>
                  <span className="truncate font-medium">{section.label}</span>
                  <span className="text-neutral-600">{section.tabs.length}</span>
                </button>
                {!collapsed &&
                  section.tabs.map((tab) => (
                    <TabRow
                      key={tab.id}
                      tab={tab}
                      checked={selected.has(tab.id)}
                      t={t}
                      onToggleChecked={toggleChecked}
                      onActivate={activate}
                      onClose={closeOne}
                      onTogglePin={togglePin}
                      onToggleMute={toggleMute}
                    />
                  ))}
              </section>
            );
          })}
      </main>

      {/* 批量操作条 */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-neutral-800 bg-neutral-900 px-3 py-2 text-xs">
          <span className="mr-auto text-neutral-400">{t('selectedCount', { count: selected.size })}</span>
          {groupTitleInput === null ? (
            <>
              <button type="button" className={toolbarBtn} onClick={() => bulkAction('closeTabs')}>
                {t('bulkClose')}
              </button>
              <button type="button" className={toolbarBtn} onClick={() => bulkAction('setPinned', { pinned: true })}>
                {t('pin')}
              </button>
              <button type="button" className={toolbarBtn} onClick={() => bulkAction('setPinned', { pinned: false })}>
                {t('unpin')}
              </button>
              <button type="button" className={toolbarBtn} onClick={() => bulkAction('setMuted', { muted: true })}>
                {t('mute')}
              </button>
              <button type="button" className={toolbarBtn} onClick={() => setGroupTitleInput('')}>
                {t('groupDots')}
              </button>
              <button type="button" className={toolbarBtn} onClick={() => setSelected(new Set())}>
                {t('clearSelection')}
              </button>
            </>
          ) : (
            <>
              <input
                autoFocus
                value={groupTitleInput}
                onChange={(e) => setGroupTitleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createGroupFromSelection();
                  if (e.key === 'Escape') setGroupTitleInput(null);
                }}
                placeholder={t('groupNamePlaceholder')}
                className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 outline-none focus:border-emerald-700"
              />
              <button
                type="button"
                className={toolbarBtn + ' !border-emerald-700 !text-emerald-400'}
                onClick={createGroupFromSelection}
              >
                {t('create')}
              </button>
              <button type="button" className={toolbarBtn} onClick={() => setGroupTitleInput(null)}>
                {t('cancel')}
              </button>
            </>
          )}
        </div>
      )}

      {/* 底部状态 */}
      <footer className="flex items-center justify-between border-t border-neutral-800 px-3 py-1.5 text-[11px] text-neutral-500">
        <span>{t('tabCount', { count: tabs.length })}</span>
        {status && <span className={status.bad ? 'text-red-400' : 'text-emerald-400'}>{status.text}</span>}
      </footer>

      {showSnapshotModal && (
        <SnapshotModal
          t={t}
          onClose={() => setShowSnapshotModal(false)}
          onRestored={(opened, skipped) => showStatus(t('statusRestored', { opened, skipped }))}
          onError={(m) => showStatus(m, true)}
        />
      )}

      {previewPlan && (
        <PreviewModal
          plan={previewPlan}
          tabs={tabs}
          categories={categoriesList}
          t={t}
          onCancel={() => setPreviewPlan(null)}
          onApplied={(r, learned) => {
            const fresh = previewPlan?.newCategories ?? [];
            setPreviewPlan(null);
            // 侧边栏同步：切到分类视图
            setViewMode('category');
            const parts = [
              t('statusAiGrouped', { grouped: r.groupedTabs, groups: r.groups }),
              fresh.length > 0
                ? t('statusNewCategories', { count: fresh.length, names: fresh.join('、') })
                : '',
              learned > 0 ? t('statusLearned', { count: learned }) : '',
            ].filter(Boolean);
            showStatus(parts.join('，'));
          }}
          onError={(m) => {
            setPreviewPlan(null);
            showStatus(m, true);
          }}
        />
      )}
    </div>
  );
}
