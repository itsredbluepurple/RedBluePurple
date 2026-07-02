import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Red Blue Purple',
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    description: 'Scores job-board companies against one prompt you write, using Claude.',
    permissions: ['storage', 'activeTab'],
    host_permissions: ['https://api.anthropic.com/*'],
    options_ui: { open_in_tab: true },
  },
});
