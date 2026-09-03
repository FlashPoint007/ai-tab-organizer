import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { browser } from 'wxt/browser';

import { PreviewModal } from '@/components/PreviewModal';
import { SnapshotModal } from '@/components/SnapshotModal';
import { TabRow } from '@/components/TabRow';
import { SearchIcon, SparkIcon } from '@/components/icons';
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
      // 折叠组的原始名字存在 session（折叠时标题被缩写或清空以节省标签栏空间）
      const collapsedTitles =
        ((await browser.storage.session.get('collapsedGroupTitles:v2'))['collapsedGroupTitles:v2'] as
          | Record<number, { full: string; short: string }>
          | undefined) ?? {};
      for (const id of missing) {
        try {
          const group = await browser.tabGroups.get(id);
          // 侧边栏始终显示真实分类名，不受折叠瘦身影响
          const title = collapsedTitles[id]?.full || group.title || '';
          if (!title) {
            // 组名暂空（可能刚建组还没来得及 update），下次事件重试
            fetchedGroupIds.current.delete(id);
            continue;
          }
          updates[id] = title;
        } catch {
          // 查询失败（组刚被解散等）：允许下次重试
          fetchedGroupIds.current.delete(id);
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
  const ghostBtn =
    'rounded-md px-1 py-1.5 text-[11px] font-medium text-neutral-400 transition hover:bg-ink-800 hover:text-neutral-100 disabled:opacity-40';
  const bulkBtn =
    'rounded-md px-2 py-1 text-[11px] font-medium text-neutral-300 transition hover:bg-ink-800 hover:text-neutral-50 disabled:opacity-40';

  return (
    <div className="flex h-screen flex-col bg-ink-950 text-neutral-100">
      {/* 头部：品牌 + 视图切换 + 搜索 + signature AI 动作 */}
      <header className="header-glow border-b border-ink-700 px-3 pb-3 pt-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-brass-300 to-brass-600 text-[11px] font-bold text-ink-950 shadow-sm">
            ◈
          </span>
          <h1 className="text-[13px] font-semibold tracking-tight text-neutral-100">
            {t('appName')}
          </h1>
        </div>

        {/* 视图切换：紧凑 segmented 控件 */}
        <div className="mt-2.5 grid grid-cols-3 gap-0.5 rounded-lg border border-ink-700 bg-ink-900 p-0.5">
          {(
            [
              ['flat', t('viewFlat')],
              ['domain', t('viewDomain')],
              ['category', t('viewCategory')],
            ] as Array<[ViewMode, string]>
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={
                'rounded-md px-2 py-1.5 text-xs font-medium transition ' +
                (viewMode === mode
                  ? 'bg-ink-800 text-brass-300 shadow-inner'
                  : 'text-neutral-400 hover:text-neutral-100')
              }
            >
              {label}
            </button>
          ))}
        </div>

        {/* 搜索 */}
        <div className="relative mt-2">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-lg border border-ink-700 bg-ink-900 py-2 pl-8 pr-3 text-[13px] text-neutral-100 outline-none transition placeholder:text-neutral-600 focus:border-brass-600/70 focus:bg-ink-850"
          />
        </div>

        {/* signature：AI 整理（唯一的高亮动作） */}
        <button
          type="button"
          disabled={organizing}
          onClick={organizeByLlm}
          className="brand-button mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-semibold disabled:cursor-not-allowed"
        >
          <SparkIcon className="h-4 w-4" />
          {organizing ? t('aiOrganizing') : t('aiOrganize')}
        </button>

        {/* 次级操作：安静的小按钮网格 */}
        <div className="mt-2 grid grid-cols-3 gap-1">
          <button type="button" className={ghostBtn} onClick={groupByDomain}>
            {t('groupByDomain')}
          </button>
          <button type="button" className={ghostBtn} onClick={groupByRules}>
            {t('groupByCategory')}
          </button>
          <button type="button" className={ghostBtn} onClick={sortByDomain}>
            {t('sortByDomain')}
          </button>
        </div>
        <div className="mt-1 grid grid-cols-3 gap-1">
          <button type="button" className={ghostBtn} onClick={() => askCleanup('duplicates')}>
            {t('cleanupDuplicates')}
            {duplicateCount > 0 && (
              <span className="ml-1 font-mono text-brass-400">{duplicateCount}</span>
            )}
          </button>
          <button type="button" className={ghostBtn} onClick={() => askCleanup('inactive')}>
            {t('cleanupInactive')}
            {inactiveCount > 0 && (
              <span className="ml-1 font-mono text-brass-400">{inactiveCount}</span>
            )}
          </button>
          <button type="button" className={ghostBtn} onClick={() => setShowSnapshotModal(true)}>
            {t('snapshots')}
          </button>
        </div>
      </header>

      {/* 两步确认条（警告态，与品牌 brass 区分） */}
      {pendingCleanup && (
        <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <span className="flex-1">{t('confirmCloseN', { count: pendingCleanup.tabIds.length })}</span>
          <button
            type="button"
            className="rounded-md bg-amber-500 px-2.5 py-1 font-medium text-ink-950 transition hover:brightness-110"
            onClick={executeCleanup}
          >
            {t('confirmClose')}
          </button>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-amber-200 transition hover:bg-ink-800"
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
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-neutral-400 transition hover:bg-ink-850 hover:text-neutral-200"
                  onClick={() =>
                    setCollapsedDomains((prev) => {
                      const next = new Set(prev);
                      if (next.has(section.key)) next.delete(section.key);
                      else next.add(section.key);
                      return next;
                    })
                  }
                >
                  <span className="text-neutral-600">{collapsed ? '▸' : '▾'}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{section.label}</span>
                  <span className="shrink-0 font-mono text-neutral-600">{section.tabs.length}</span>
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
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-brass-300/90 transition hover:bg-ink-850 hover:text-brass-200"
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
                  <span className="text-brass-500/70">{collapsed ? '▸' : '▾'}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{section.label}</span>
                  <span className="shrink-0 font-mono text-neutral-600">{section.tabs.length}</span>
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
        <div className="flex flex-wrap items-center gap-1.5 border-t border-ink-700 bg-ink-900/80 px-3 py-2 text-xs backdrop-blur">
          <span className="mr-auto font-mono text-neutral-400">
            {t('selectedCount', { count: selected.size })}
          </span>
          {groupTitleInput === null ? (
            <>
              <button type="button" className={bulkBtn} onClick={() => bulkAction('closeTabs')}>
                {t('bulkClose')}
              </button>
              <button type="button" className={bulkBtn} onClick={() => bulkAction('setPinned', { pinned: true })}>
                {t('pin')}
              </button>
              <button type="button" className={bulkBtn} onClick={() => bulkAction('setPinned', { pinned: false })}>
                {t('unpin')}
              </button>
              <button type="button" className={bulkBtn} onClick={() => bulkAction('setMuted', { muted: true })}>
                {t('mute')}
              </button>
              <button type="button" className={bulkBtn} onClick={() => setGroupTitleInput('')}>
                {t('groupDots')}
              </button>
              <button type="button" className={bulkBtn} onClick={() => setSelected(new Set())}>
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
                className="min-w-0 flex-1 rounded-md border border-ink-700 bg-ink-950 px-2 py-1 outline-none transition focus:border-brass-600/70 focus:bg-ink-900"
              />
              <button
                type="button"
                className="brand-button rounded-md px-2.5 py-1 text-[11px] font-semibold"
                onClick={createGroupFromSelection}
              >
                {t('create')}
              </button>
              <button type="button" className={bulkBtn} onClick={() => setGroupTitleInput(null)}>
                {t('cancel')}
              </button>
            </>
          )}
        </div>
      )}

      {/* 底部状态 */}
      <footer className="flex items-center justify-between gap-2 border-t border-ink-700 bg-ink-900/60 px-3 py-2 text-[11px] text-neutral-500">
        <span className="shrink-0 font-mono text-neutral-600">
          {t('tabCount', { count: tabs.length })}
        </span>
        {status && (
          <span className="min-w-0 truncate text-right">
            <span className={status.bad ? 'text-red-300' : 'text-mint-300'}>{status.text}</span>
          </span>
        )}
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
