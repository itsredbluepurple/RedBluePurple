import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Red Blue Purple',
    description: 'Scores job-board companies against one prompt you write, using Claude.',
    permissions: ['storage', 'activeTab'],
    host_permissions: ['https://api.anthropic.com/*'],
    options_ui: { open_in_tab: true },
  },
});
