import { browser } from 'wxt/browser';

export default defineBackground(() => {
  console.info('[ai-tab-organizer] background service worker started');

  browser.runtime.onInstalled.addListener((details) => {
    console.info('[ai-tab-organizer] onInstalled:', details.reason);
  });

  // TODO(M1): 在此挂载 TabEventHub
  //   tabs.onCreated / onUpdated / onRemoved / onActivated -> TabRegistry
});
