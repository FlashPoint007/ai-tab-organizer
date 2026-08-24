import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { browser } from 'wxt/browser';

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
import { parseEvent } from '@/lib/messaging/protocol';
import type { TabMeta } from '@/lib/types';

type ViewMode = 'flat' | 'domain';

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
  const [groupTitleInput, setGroupTitleInput] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; bad?: boolean } | null>(null);
  const [collapsedDomains, setCollapsedDomains] = useState<Set<string>>(new Set());

  const ownWindowIdRef = useRef<number | undefined>(undefined);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showStatus = useCallback((text: string, bad = false) => {
    setStatus({ text, bad });
    if (statusTimer.current !== undefined) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(null), 3500);
  }, []);

  // ---------- 初始加载 + 事件订阅 ----------
  useEffect(() => {
    void (async () => {
      try {
        const win = await browser.windows.getCurrent();
        ownWindowIdRef.current = win.id;
        setTabs(await sendRequest<TabMeta[]>({ type: 'getSnapshot' }));
      } catch (e) {
        showStatus(e instanceof Error ? e.message : String(e), true);
      } finally {
        setLoaded(true);
      }
    })();

    const listener = (raw: unknown): void => {
      const ev = parseEvent(raw);
      if (ev?.type === 'tabsUpdated' && ev.windowId === ownWindowIdRef.current) {
        setTabs(ev.tabs);
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [showStatus]);

  // 标签消失后修剪选择集
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const alive = new Set(tabs.map((t) => t.id));
      const next = new Set([...prev].filter((id) => alive.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [tabs]);

  // ---------- 派生数据 ----------
  const visibleTabs = useMemo(() => filterTabs(tabs, search), [tabs, search]);

  const duplicateCount = useMemo(
    () => cleanupCandidatesFromClusters(findDuplicateTabs(visibleTabs)).length,
    [visibleTabs],
  );
  const inactiveCount = useMemo(() => findInactiveTabs(visibleTabs).length, [visibleTabs]);

  const domainSections = useMemo(() => {
    if (viewMode !== 'domain') return [];
    const groups = computeDomainGroups(visibleTabs, { minGroupSize: 1, includePinned: true });
    const groupedIds = new Set(groups.flatMap((g) => g.tabIds));
    const rest = visibleTabs.filter((t) => !groupedIds.has(t.id));
    return [...groups.map((g) => ({ key: g.domain, label: g.domain, tabs: tabsInOrder(g.tabIds) })), ...(rest.length > 0 ? [{ key: '__ungrouped__', label: '未分组', tabs: tabsInOrder(rest.map((t) => t.id)) }] : [])];
    function tabsInOrder(ids: number[]): TabMeta[] {
      return ids.map((id) => visibleTabs.find((t) => t.id === id)).filter((t): t is TabMeta => !!t);
    }
  }, [viewMode, visibleTabs]);

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

  const activate = (tabId: number) => void run(() => sendRequest({ type: 'activateTab', tabId }).then(() => undefined));
  const closeOne = (tabId: number) => void run(async () => { await sendRequest({ type: 'closeTabs', tabIds: [tabId] }); });
  const togglePin = (tab: TabMeta) => void run(() => sendRequest({ type: 'setPinned', tabIds: [tab.id], pinned: !tab.pinned }).then(() => undefined));
  const toggleMute = (tab: TabMeta) => void run(() => sendRequest({ type: 'setMuted', tabIds: [tab.id], muted: !tab.muted }).then(() => undefined));

  const toggleChecked = (tabId: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tabId)) next.delete(tabId);
      else next.add(tabId);
      return next;
    });

  const bulkAction = (
    action: 'closeTabs' | 'setPinned' | 'setMuted',
    extra?: { pinned?: boolean; muted?: boolean },
  ) => {
    if (selected.size === 0) return;
    const tabIds = [...selected];
    void run(async () => {
      if (action === 'closeTabs') {
        const r = await sendRequest<{ closed: number }>({ type: 'closeTabs', tabIds });
        showStatus(`已关闭 ${r.closed} 个标签`);
      } else if (action === 'setPinned') {
        await sendRequest({ type: 'setPinned', tabIds, pinned: extra?.pinned ?? true });
      } else {
        await sendRequest({ type: 'setMuted', tabIds, muted: extra?.muted ?? true });
      }
      setSelected(new Set());
    });
  };

  const createGroupFromSelection = () => {
    const title = (groupTitleInput ?? '').trim();
    if (!title || selected.size === 0) return;
    void run(async () => {
      await sendRequest({ type: 'createGroupFromSelection', tabIds: [...selected], title });
      showStatus(`已创建分组「${title}」`);
      setGroupTitleInput(null);
      setSelected(new Set());
    });
  };

  const groupByDomain = () => void run(async () => {
    const r = await sendRequest<{ groups: number; groupedTabs: number }>({
      type: 'groupTabsByDomain',
      minGroupSize: 2,
    });
    showStatus(`已按域名分成 ${r.groups} 组（${r.groupedTabs} 个标签）`);
  });

  const sortByDomain = () => void run(async () => {
    const r = await sendRequest<{ moved: number }>({ type: 'sortTabsByDomain' });
    showStatus(`已排序，移动了 ${r.moved} 个标签`);
  });

  const groupByRules = () => void run(async () => {
    const r = await sendRequest<{ groups: number; groupedTabs: number; unmatched: number }>({
      type: 'groupTabsByRules',
    });
    const extra = r.unmatched > 0 ? `，${r.unmatched} 个未匹配` : '';
    showStatus(`已按类别分成 ${r.groups} 组（${r.groupedTabs} 个标签${extra}）`);
  });

  const executeCleanup = () => {
    if (!pendingCleanup) return;
    const { kind, tabIds } = pendingCleanup;
    setPendingCleanup(null);
    void run(async () => {
      const type = kind === 'duplicates' ? ('cleanupDuplicates' as const) : ('cleanupInactive' as const);
      const r = await sendRequest<{ closed: number; snapshotId: string }>({ type, ...{} });
      void tabIds;
      showStatus(r.closed > 0 ? `已关闭 ${r.closed} 个标签（已存快照，可恢复）` : '没有需要清理的标签');
    });
  };

  const askCleanup = (kind: PendingCleanup['kind']) => {
    const ids = kind === 'duplicates'
      ? cleanupCandidatesFromClusters(findDuplicateTabs(visibleTabs))
      : findInactiveTabs(visibleTabs);
    if (ids.length === 0) {
      showStatus('没有可清理的标签', true);
      return;
    }
    setPendingCleanup({ kind, tabIds: ids });
  };

  // ---------- 渲染 ----------
  const toolbarBtn =
    'rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300 transition hover:border-neutral-600 hover:text-white disabled:opacity-40';

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      {/* 头部 */}
      <header className="border-b border-neutral-800 px-3 py-2">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-semibold tracking-tight">AI Tab Organizer</h1>
          <div className="flex items-center gap-1 text-xs">
            <button
              type="button"
              className={`${toolbarBtn} ${viewMode === 'flat' ? '!border-emerald-700 !text-emerald-400' : ''}`}
              onClick={() => setViewMode('flat')}
            >
              列表
            </button>
            <button
              type="button"
              className={`${toolbarBtn} ${viewMode === 'domain' ? '!border-emerald-700 !text-emerald-400' : ''}`}
              onClick={() => setViewMode('domain')}
            >
              域名
            </button>
          </div>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索标题或网址…"
          className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-sm outline-none placeholder:text-neutral-600 focus:border-emerald-700"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" className={toolbarBtn} onClick={groupByDomain}>按域名分组</button>
          <button type="button" className={toolbarBtn} onClick={groupByRules}>按类别分组</button>
          <button type="button" className={toolbarBtn} onClick={sortByDomain}>域名排序</button>
          <button type="button" className={toolbarBtn} onClick={() => askCleanup('duplicates')}>
            清理重复{duplicateCount > 0 ? `(${duplicateCount})` : ''}
          </button>
          <button type="button" className={toolbarBtn} onClick={() => askCleanup('inactive')}>
            清理非活跃{inactiveCount > 0 ? `(${inactiveCount})` : ''}
          </button>
          <button type="button" className={toolbarBtn} onClick={() => setShowSnapshotModal(true)}>快照</button>
        </div>
      </header>

      {/* 两步确认条 */}
      {pendingCleanup && (
        <div className="flex items-center gap-2 border-b border-amber-900/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
          <span className="flex-1">将关闭 {pendingCleanup.tabIds.length} 个标签（先自动存快照）</span>
          <button
            type="button"
            className="rounded bg-amber-700 px-2 py-1 font-medium text-white hover:bg-amber-600"
            onClick={executeCleanup}
          >
            确认关闭
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-amber-300 hover:bg-neutral-800"
            onClick={() => setPendingCleanup(null)}
          >
            取消
          </button>
        </div>
      )}

      {/* 列表 */}
      <main className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {!loaded && <p className="p-4 text-sm text-neutral-500">加载中…</p>}
        {loaded && visibleTabs.length === 0 && (
          <p className="p-4 text-center text-sm text-neutral-500">
            {search ? '没有匹配的标签' : '当前窗口没有标签'}
          </p>
        )}

        {viewMode === 'flat' &&
          visibleTabs.map((tab) => (
            <TabRow
              key={tab.id}
              tab={tab}
              checked={selected.has(tab.id)}
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
              <section key={section.key} className="mb-2">
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
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
          <span className="mr-auto text-neutral-400">已选 {selected.size}</span>
          {groupTitleInput === null ? (
            <>
              <button type="button" className={toolbarBtn} onClick={() => bulkAction('closeTabs')}>关闭</button>
              <button type="button" className={toolbarBtn} onClick={() => bulkAction('setPinned', { pinned: true })}>固定</button>
              <button type="button" className={toolbarBtn} onClick={() => bulkAction('setPinned', { pinned: false })}>取消固定</button>
              <button type="button" className={toolbarBtn} onClick={() => bulkAction('setMuted', { muted: true })}>静音</button>
              <button type="button" className={toolbarBtn} onClick={() => setGroupTitleInput('')}>建组…</button>
              <button type="button" className={toolbarBtn} onClick={() => setSelected(new Set())}>取消选择</button>
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
                placeholder="分组名称，回车确认"
                className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 outline-none focus:border-emerald-700"
              />
              <button type="button" className={toolbarBtn + ' !border-emerald-700 !text-emerald-400'} onClick={createGroupFromSelection}>
                创建
              </button>
              <button type="button" className={toolbarBtn} onClick={() => setGroupTitleInput(null)}>取消</button>
            </>
          )}
        </div>
      )}

      {/* 底部状态 */}
      <footer className="flex items-center justify-between border-t border-neutral-800 px-3 py-1.5 text-[11px] text-neutral-500">
        <span>{tabs.length} 个标签</span>
        {status && <span className={status.bad ? 'text-red-400' : 'text-emerald-400'}>{status.text}</span>}
      </footer>

      {showSnapshotModal && (
        <SnapshotModal
          onClose={() => setShowSnapshotModal(false)}
          onRestored={(opened, skipped) => showStatus(`已恢复 ${opened} 个标签，跳过已打开的 ${skipped} 个`)}
          onError={(m) => showStatus(m, true)}
        />
      )}
    </div>
  );
}
