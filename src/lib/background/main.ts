/** Background 装配入口：注册表 -> 事件中枢 -> 自动触发器 -> 实时归类 -> 折叠管理 -> 消息路由。 */
import { ensureRegistryLoaded } from './tabRegistry';
import { startEventHub } from './tabEventHub';
import { startMessageRouter } from './messageRouter';
import { startAutoTriggers, syncAutoOrganizeAlarm } from './autoTrigger';
import { startRealtimeClassifier } from './realtimeClassifier';
import { startCollapsedGroupManager } from './collapsedGroups';

export async function startBackground(): Promise<void> {
  await ensureRegistryLoaded();
  startEventHub();
  startAutoTriggers();
  startRealtimeClassifier();
  startCollapsedGroupManager();
  startMessageRouter();
  void syncAutoOrganizeAlarm();
}
