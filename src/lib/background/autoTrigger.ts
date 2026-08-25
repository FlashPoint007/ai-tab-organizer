/**
 * 自动整理触发器（M4）：
 * - 快捷键 commands（始终可用，不受 mode 限制）
 * - alarms 定时间隔（mode=interval）
 * - 新标签累积阈值（mode=threshold，带冷却防抖）
 *
 * 触发即直接应用方案（无 UI 预览）；LLM 未配置时静默跳过。
 */
import { browser } from 'wxt/browser';

import { loadSettings } from '../settings/settingsStore';
import type { KVStorage } from '../storage/kv';
import { localKV, sessionKV } from '../storage/browserKv';
import { isWebUrl } from '../organizer/domains';
import { organizeTabsByLlm } from './organizeService';
import { getTabsForWindow } from './tabRegistry';

export const AUTO_ORGANIZE_ALARM = 'auto-organize-interval';
const COOLDOWN_MS = 15 * 60 * 1000;
const THRESHOLD_CHECK_DEBOUNCE_MS = 30_000;

/** 纯函数：阈值模式此刻是否应该触发。 */
export function shouldAutoTrigger(params: {
  mode: string;
  ungroupedCount: number;
  thresholdCount: number;
  lastRunAt: number | undefined;
  now: number;
  cooldownMs?: number;
}): boolean {
  const { mode, ungroupedCount, thresholdCount, lastRunAt, now } = params;
  const cooldownMs = params.cooldownMs ?? COOLDOWN_MS;
  if (mode !== 'threshold') return false;
  if (ungroupedCount < thresholdCount) return false;
  if (lastRunAt !== undefined && now - lastRunAt < cooldownMs) return false;
  return true;
}

async function runOrganize(windowId: number): Promise<void> {
  try {
    await organizeTabsByLlm(windowId);
  } catch (e) {
    // 自动触发不打扰用户：只记录
    console.info('[ai-tab-organizer] auto organize skipped:', e instanceof Error ? e.message : e);
  }
}

/** 读取某窗口的阈值触发时间戳（session 存储，浏览器关闭即重置）。 */
async function getLastTriggerAt(windowId: number): Promise<number | undefined> {
  const key = `lastAutoTrigger:${windowId}`;
  return sessionKV.get<number>(key);
}

async function markTriggered(windowId: number): Promise<void> {
  await sessionKV.set(`lastAutoTrigger:${windowId}`, Date.now());
}

/**
 * 注册全部自动触发路径。幂等：重复调用不会叠加监听（SW 每次冷启动调用一次）。
 */
export function startAutoTriggers(): void {
  // ---- 快捷键 ----
  browser.commands?.onCommand.addListener((command) => {
    if (command !== 'organize-tabs') return;
    void (async () => {
      const win = await browser.windows.getLastFocused();
      if (win.id === undefined) return;
      await runOrganize(win.id);
    })();
  });

  // ---- 定时闹钟 ----
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== AUTO_ORGANIZE_ALARM) return;
    void (async () => {
      const settings = await loadSettings(localKV);
      if (settings.autoOrganize.mode !== 'interval') return;
      const win = await browser.windows.getLastFocused();
      if (win.id === undefined) return;
      await runOrganize(win.id);
    })();
  });

  // ---- 新标签累积阈值（30s 合并检查 + 冷却） ----
  let checkTimer: ReturnType<typeof setTimeout> | undefined = undefined;
  const pendingWindows = new Set<number>();

  browser.tabs.onCreated.addListener((tab) => {
    if (!isWebUrl(tab.url ?? '')) return; // 常见的 newtab 不计入
    if (tab.windowId === undefined) return;
    pendingWindows.add(tab.windowId);
    if (checkTimer !== undefined) clearTimeout(checkTimer);
    checkTimer = setTimeout(() => {
      checkTimer = undefined;
      void (async () => {
        const settings = await loadSettings(localKV);
        if (settings.autoOrganize.mode !== 'threshold') {
          pendingWindows.clear();
          return;
        }
        for (const windowId of [...pendingWindows]) {
          pendingWindows.delete(windowId);
          const tabs = getTabsForWindow(windowId).filter((t) => isWebUrl(t.url) && t.groupId === -1);
          const lastRunAt = await getLastTriggerAt(windowId);
          if (!shouldAutoTrigger({ mode: 'threshold', ungroupedCount: tabs.length, thresholdCount: settings.autoOrganize.thresholdCount, lastRunAt, now: Date.now() })) continue;
          await markTriggered(windowId);
          await runOrganize(windowId);
        }
      })();
    }, THRESHOLD_CHECK_DEBOUNCE_MS);
  });
}

/** 设置变更 / SW 启动时同步 interval 闹钟。 */
export async function syncAutoOrganizeAlarm(kv: KVStorage = localKV): Promise<void> {
  const settings = await loadSettings(kv);
  const existing = await browser.alarms.get(AUTO_ORGANIZE_ALARM);
  if (settings.autoOrganize.mode === 'interval') {
    const period = Math.max(5, settings.autoOrganize.intervalMinutes);
    if (!existing || existing.periodInMinutes !== period) {
      await browser.alarms.create(AUTO_ORGANIZE_ALARM, { periodInMinutes: period });
    }
  } else if (existing) {
    await browser.alarms.clear(AUTO_ORGANIZE_ALARM);
  }
}
