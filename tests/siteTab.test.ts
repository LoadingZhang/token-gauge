import { afterEach, describe, expect, it, vi } from 'vitest';
import { runInSiteTab } from '../src/providers/siteTab';

const origin = 'https://token.woa.com';

function mockBrowser(existing: chrome.tabs.Tab[] = []) {
  const tab = { id: 10, status: 'complete', url: `${origin}/` };
  const api = {
    tabs: {
      query: vi.fn().mockResolvedValue(existing),
      get: vi.fn().mockResolvedValue(tab),
      create: vi.fn().mockResolvedValue(tab),
      remove: vi.fn().mockResolvedValue(undefined),
      onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    scripting: { executeScript: vi.fn().mockResolvedValue([{ result: { status: 200 } }]) },
  };
  vi.stubGlobal('chrome', api);
  return api;
}

afterEach(() => vi.unstubAllGlobals());

describe('runInSiteTab', () => {
  it('uses an existing matching tab in an isolated world and leaves it open', async () => {
    const api = mockBrowser([{ id: 10, status: 'complete', url: `${origin}/` } as chrome.tabs.Tab]);
    const query = async () => ({ status: 200 });
    expect(await runInSiteTab(origin, query)).toEqual({ status: 200 });
    expect(api.scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 10 }, world: 'ISOLATED', func: query });
    expect(api.tabs.create).not.toHaveBeenCalled();
    expect(api.tabs.remove).not.toHaveBeenCalled();
  });

  it('returns unavailable without opening a tab during the first lookup', async () => {
    const api = mockBrowser();
    expect(await runInSiteTab(origin, async () => ({}))).toBeUndefined();
    expect(api.tabs.create).not.toHaveBeenCalled();
  });

  it('opens an inactive tab when requested and closes it after the query', async () => {
    const api = mockBrowser();
    expect(await runInSiteTab(origin, async () => ({}), true)).toEqual({ status: 200 });
    expect(api.tabs.create).toHaveBeenCalledWith({ url: `${origin}/`, active: false });
    expect(api.tabs.remove).toHaveBeenCalledWith(10);
    expect(api.tabs.onUpdated.removeListener).toHaveBeenCalled();
  });

  it('closes the temporary tab when scripting fails', async () => {
    const api = mockBrowser();
    api.scripting.executeScript.mockRejectedValue(new Error('Permission denied'));
    await expect(runInSiteTab(origin, async () => ({}), true)).rejects.toThrow('Permission denied');
    expect(api.tabs.remove).toHaveBeenCalledWith(10);
  });

  it('does not inject into an OA redirect or another site', async () => {
    const api = mockBrowser();
    api.tabs.get.mockResolvedValue({ id: 10, status: 'complete', url: 'https://std.passport.woa.com/signin' });
    expect(await runInSiteTab(origin, async () => ({}), true)).toBeUndefined();
    expect(api.scripting.executeScript).not.toHaveBeenCalled();
    expect(api.tabs.remove).toHaveBeenCalledWith(10);
  });
});
