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
    // 用户配置任意 LLM 端点后，由 Options 页在用户手势里动态申请对应 origin
    // （保持安装时零 host 权限，隐私面最小）
    optional_host_permissions: ['http://*/*', 'https://*/*'],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
