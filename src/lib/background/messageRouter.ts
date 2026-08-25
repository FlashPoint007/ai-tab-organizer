/** 消息路由：把 Panel/Options 的请求分发给对应服务。 */
import { browser } from 'wxt/browser';

import type { Request } from '../messaging/protocol';
import { requestSchema } from '../messaging/protocol';
import { assignGroupColors, computeDomainGroups } from '../organizer/grouping';
import {
  cleanupCandidatesFromClusters,
  findDuplicateTabs,
  findInactiveTabs,
} from '../organizer/cleanup';
import {
  createTabGroup,
  ungroupAllUngroupedTabsInWindow,
  ungroupTabs as ungroupTabsApi,
} from '../browser/groupsWrap';
import { getAllTabsMeta, getWindowTabsMeta } from '../browser/tabsWrap';
import { applyRules, colorForCategory, computeCategoryGroups } from '../organizer/rules';
import { mergeLearnedRules } from '../organizer/learning';
import { loadSettings, saveSettings } from '../settings/settingsStore';
import {
  clearLlmUsage,
  describeLlmError,
  getLlmUsage,
  organizeTabsByLlm,
} from './organizeService';
import { createLlmClient } from '../llm/client';
import { safeBroadcast } from './tabEventHub';
import { applyCategoryPlan, computeOrganizePlan } from './organizeService';
import { syncAutoOrganizeAlarm } from './autoTrigger';
import { localKV } from '../storage/browserKv';
import { clearCategoryCache } from '../storage/categoryCache';
import { err, ok } from '../types';
import type { Result } from '../types';
import {
  createSnapshot,
  deleteSnapshot,
  getSnapshot,
  listSnapshots,
  planRestore,
} from './snapshotService';

export function startMessageRouter(): void {
  browser.runtime.onMessage.addListener(
    (raw: unknown, _sender: unknown, sendResponse: (result: Result<unknown>) => void): boolean => {
      const parsed = requestSchema.safeParse(raw);
      if (!parsed.success) return false; // 不是我们的协议（例如广播事件回环），不接管
      void handleRequest(parsed.data)
        .then(sendResponse)
        .catch((e) => sendResponse(err(e)));
      return true; // 异步回包
    },
  );
}

async function handleRequest(req: Request): Promise<Result<unknown>> {
  try {
    return ok(await dispatch(req));
  } catch (e) {
    return err(e);
  }
}

async function lastFocusedWindowId(): Promise<number> {
  const win = await browser.windows.getLastFocused();
  if (win.id === undefined) throw new Error('没有可用的窗口');
  return win.id;
}

function domainKey(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '􏿿'; // 非法 URL 排到最后
  }
}

/** 各请求的处理结果直接以 unknown 回传；载荷正确性由 zod schema 与各服务保证。 */
async function dispatch(req: Request): Promise<unknown> {
  switch (req.type) {
    case 'getSnapshot':
      return getWindowTabsMeta(await lastFocusedWindowId());

    case 'activateTab': {
      const tab = await browser.tabs.get(req.tabId);
      await browser.tabs.update(req.tabId, { active: true });
      if (tab.windowId !== undefined) await browser.windows.update(tab.windowId, { focused: true });
      return null;
    }

    case 'closeTabs': {
      const results = await Promise.allSettled(req.tabIds.map((id) => browser.tabs.remove(id)));
      return { closed: results.filter((r) => r.status === 'fulfilled').length };
    }

    case 'setPinned': {
      await Promise.allSettled(
        req.tabIds.map((id) => browser.tabs.update(id, { pinned: req.pinned })),
      );
      return null;
    }

    case 'setMuted': {
      await Promise.allSettled(req.tabIds.map((id) => browser.tabs.update(id, { muted: req.muted })));
      return null;
    }

    case 'ungroupTabs': {
      await ungroupTabsApi(req.tabIds);
      return null;
    }

    case 'createGroupFromSelection': {
      const firstId = req.tabIds[0];
      if (firstId === undefined) throw new Error('选择为空');
      const first = await browser.tabs.get(firstId);
      if (first.windowId === undefined) throw new Error('无法确定标签所在窗口');
      const groupId = await createTabGroup(first.windowId, req.tabIds, {
        title: req.title,
        collapsed: false,
      });
      return { groupId };
    }

    case 'groupTabsByDomain': {
      const windowId = await lastFocusedWindowId();
      const tabs = await getWindowTabsMeta(windowId);
      const groups = computeDomainGroups(tabs, { minGroupSize: req.minGroupSize });

      // 清场：先解除旧的自动分组，避免残留旧归属（固定标签不受影响）
      await ungroupAllUngroupedTabsInWindow(windowId);

      const colors = assignGroupColors(groups);
      let groupedTabs = 0;
      for (const group of groups) {
        await createTabGroup(windowId, group.tabIds, {
          title: group.domain,
          color: colors.get(group.domain),
          collapsed: false,
        });
        groupedTabs += group.tabIds.length;
      }
      return { groups: groups.length, groupedTabs };
    }

    case 'sortTabsByDomain': {
      const windowId = await lastFocusedWindowId();
      const tabs = await getWindowTabsMeta(windowId);
      const pinnedCount = tabs.filter((t) => t.pinned).length;
      const movable = [...tabs]
        .filter((t) => !t.pinned)
        .sort((a, b) => {
          const da = domainKey(a.url);
          const db = domainKey(b.url);
          if (da !== db) return da < db ? -1 : 1;
          return a.index - b.index;
        });

      // 固定标签占据前部索引，其余按域名分块依次排下去
      let cursor = pinnedCount;
      let moved = 0;
      for (const tab of movable) {
        if (tab.index !== cursor) {
          await browser.tabs.move(tab.id, { index: cursor });
          moved += 1;
        }
        cursor += 1;
      }
      return { moved };
    }

    case 'cleanupDuplicates': {
      const windowId = await lastFocusedWindowId();
      const clusters = findDuplicateTabs(await getWindowTabsMeta(windowId));
      const candidates = cleanupCandidatesFromClusters(clusters);
      if (candidates.length === 0) return { closed: 0, snapshotId: '' };

      const snapshot = await createSnapshot('cleanup-duplicates', undefined);
      const results = await Promise.allSettled(candidates.map((id) => browser.tabs.remove(id)));
      return { closed: results.filter((r) => r.status === 'fulfilled').length, snapshotId: snapshot.id };
    }

    case 'cleanupInactive': {
      const windowId = await lastFocusedWindowId();
      const candidates = findInactiveTabs(await getWindowTabsMeta(windowId));
      if (candidates.length === 0) return { closed: 0, snapshotId: '' };

      const snapshot = await createSnapshot('cleanup-inactive', undefined);
      const results = await Promise.allSettled(candidates.map((id) => browser.tabs.remove(id)));
      return { closed: results.filter((r) => r.status === 'fulfilled').length, snapshotId: snapshot.id };
    }

    case 'createSnapshot': {
      const snapshot = await createSnapshot('manual', req.label);
      return { snapshotId: snapshot.id };
    }

    case 'listSnapshots':
      return listSnapshots();

    case 'deleteSnapshot': {
      await deleteSnapshot(req.id);
      return null;
    }

    case 'groupTabsByRules': {
      const windowId = await lastFocusedWindowId();
      const tabs = await getWindowTabsMeta(windowId);
      const settings = await loadSettings(localKV);

      const assignments = applyRules(tabs, settings.rules);
      const groups = computeCategoryGroups(tabs, assignments, settings.minGroupSizeForRules);

      // 清场后按类别建组：配色由类别名哈希决定，跨会话稳定
      await ungroupAllUngroupedTabsInWindow(windowId);
      let groupedTabs = 0;
      for (const group of groups) {
        await createTabGroup(windowId, group.tabIds, {
          title: group.category,
          color: colorForCategory(group.category),
          collapsed: false,
        });
        groupedTabs += group.tabIds.length;
      }
      return { groups: groups.length, groupedTabs, unmatched: tabs.length - groupedTabs };
    }

    case 'listRules':
      return (await loadSettings(localKV)).rules;

    case 'saveRules': {
      const settings = await loadSettings(localKV);
      await saveSettings({ ...settings, rules: req.rules }, localKV);
      return null;
    }

    case 'listCategories':
      return (await loadSettings(localKV)).categories;

    case 'saveCategories': {
      const settings = await loadSettings(localKV);
      await saveSettings({ ...settings, categories: req.categories }, localKV);
      return null;
    }

    case 'organizeByLlm': {
      const windowId = await lastFocusedWindowId();
      try {
        return await organizeTabsByLlm(windowId);
      } catch (e) {
        // 统一转成可读文案；cause 保留原始错误便于排查
        throw new Error(describeLlmError(e), { cause: e });
      }
    }

    case 'testLlmConnection': {
      const client = createLlmClient(req.config);
      return client.testConnection();
    }

    case 'saveLlmConfig': {
      const settings = await loadSettings(localKV);
      await saveSettings(
        {
          ...settings,
          llm: {
            preset: req.config.preset,
            baseUrl: req.config.baseUrl,
            model: req.config.model,
            ...(req.config.apiKey ? { apiKey: req.config.apiKey } : {}),
            ...(req.config.temperature !== undefined ? { temperature: req.config.temperature } : {}),
            ...(req.config.maxOutputTokens !== undefined
              ? { maxOutputTokens: req.config.maxOutputTokens }
              : {}),
          },
        },
        localKV,
      );
      void syncAutoOrganizeAlarm(localKV);
      return null;
    }

    case 'getLlmUsage':
      return getLlmUsage(localKV);

    case 'getLlmConfig': {
      // 返回协议形态（不含未设置的可选字段）
      const settings = await loadSettings(localKV);
      return settings.llm;
    }

    case 'clearLlmUsage':
      await clearLlmUsage(localKV);
      return null;

    case 'clearCategoryCache':
      await clearCategoryCache(localKV);
      return null;

    case 'planOrganizeByLlm': {
      const windowId = await lastFocusedWindowId();
      try {
        return await computeOrganizePlan(windowId);
      } catch (e) {
        throw new Error(describeLlmError(e), { cause: e });
      }
    }

    case 'applyCategoryPlan': {
      const windowId = await lastFocusedWindowId();
      return applyCategoryPlan(windowId, req.assignments);
    }

    case 'getUiSettings': {
      const settings = await loadSettings(localKV);
      return {
        language: settings.language,
        autoApply: settings.autoApply,
        realtime: settings.realtime,
        autoOrganize: settings.autoOrganize,
      };
    }

    case 'saveUiSettings': {
      const settings = await loadSettings(localKV);
      const next = {
        ...settings,
        ...(req.language !== undefined ? { language: req.language } : {}),
        ...(req.autoApply !== undefined ? { autoApply: req.autoApply } : {}),
        ...(req.realtime !== undefined ? { realtime: req.realtime } : {}),
        ...(req.autoOrganize !== undefined ? { autoOrganize: req.autoOrganize } : {}),
      };
      await saveSettings(next, localKV);
      void syncAutoOrganizeAlarm(localKV);
      // 让已打开的 Side Panel 即时切换语言 / 生效 autoApply
      safeBroadcast({ type: 'settingsChanged', language: next.language, autoApply: next.autoApply });
      return null;
    }

    case 'getExportBundle': {
      const settings = await loadSettings(localKV);
      return {
        rules: settings.rules,
        categories: settings.categories,
        minGroupSizeForRules: settings.minGroupSizeForRules,
        autoApply: settings.autoApply,
        autoOrganize: settings.autoOrganize,
        language: settings.language,
        realtime: settings.realtime,
        llm: settings.llm,
      };
    }

    case 'learnFromCorrections': {
      const settings = await loadSettings(localKV);
      const outcome = mergeLearnedRules(settings.rules, req.corrections, () => crypto.randomUUID());
      if (outcome.added > 0 || outcome.updated > 0) {
        await saveSettings({ ...settings, rules: outcome.rules }, localKV);
      }
      return { added: outcome.added, updated: outcome.updated };
    }

    case 'restoreSnapshot': {
      const snapshot = await getSnapshot(req.id);
      if (!snapshot) throw new Error('快照不存在或已被删除');
      const plan = planRestore(
        (await getAllTabsMeta()).map((t) => t.url),
        snapshot.tabs,
      );
      const windowId = await lastFocusedWindowId();
      for (const item of plan.toOpen) {
        await browser.tabs.create({ windowId, url: item.url, pinned: item.pinned, active: false });
      }
      return { opened: plan.toOpen.length, skipped: plan.skipped };
    }
  }
}
