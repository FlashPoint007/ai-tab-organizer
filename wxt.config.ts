import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'AI Tab Organizer',
    description:
      'Organize browser tabs automatically and classify them with LLMs (custom API or local model).',
    permissions: [
      'tabs',
      'tabGroups',
      'sidePanel',
      'alarms',
      'storage',
      'unlimitedStorage',
      'favicon',
    ],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
