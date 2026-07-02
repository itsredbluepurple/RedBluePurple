import { describe, it, expect } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

describe('scaffold', () => {
  it('exposes a fake browser storage in the test env', async () => {
    await fakeBrowser.storage.local.set({ ping: 1 });
    const got = await fakeBrowser.storage.local.get('ping');
    expect(got.ping).toBe(1);
  });
});
