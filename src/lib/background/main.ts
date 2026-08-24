/** Background 装配入口：注册表 -> 事件中枢 -> 消息路由。 */
import { ensureRegistryLoaded } from './tabRegistry';
import { startEventHub } from './tabEventHub';
import { startMessageRouter } from './messageRouter';

export async function startBackground(): Promise<void> {
  await ensureRegistryLoaded();
  startEventHub();
  startMessageRouter();
}
