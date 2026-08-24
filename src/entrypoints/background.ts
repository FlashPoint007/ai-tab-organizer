import { startBackground } from '@/lib/background/main';

export default defineBackground(() => {
  console.info('[ai-tab-organizer] background service worker starting');
  void startBackground();
});
