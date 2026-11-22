// Execute only in a matching site's isolated world so its session stays in that tab.
// A tab created for a background query is inactive and closed when the query finishes.
export async function runInSiteTab<T>(
  origin: string,
  func: () => Promise<T>,
  createIfMissing = false,
): Promise<T | undefined> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query || !chrome.scripting?.executeScript) {
    return undefined;
  }

  const tabs = await chrome.tabs.query({ url: `${origin}/*` });
  tabs.sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)));
  let tab = tabs.find(item => item.id !== undefined && item.status === 'complete');
  let createdId: number | undefined;
  try {
    if (!tab && createIfMissing) {
      tab = await chrome.tabs.create({ url: `${origin}/`, active: false });
      createdId = tab.id;
      if (tab.id !== undefined) await waitForTabComplete(tab.id);
    }
    if (tab?.id === undefined) return undefined;
    const current = await chrome.tabs.get(tab.id);
    if (!current.url || new URL(current.url).origin !== origin) return undefined;
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'ISOLATED',
      func,
    });
    return results[0]?.result as T | undefined;
  } finally {
    if (createdId !== undefined) {
      await chrome.tabs.remove(createdId).catch(() => {});
    }
  }
}

async function waitForTabComplete(tabId: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
    const onUpdated = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') {
        cleanup();
        resolve();
      }
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('等待已登录页面加载超时，请打开对应网页后刷新。'));
    }, 15_000);
    chrome.tabs.onUpdated.addListener(onUpdated);
    void chrome.tabs.get(tabId).then(tab => {
      if (tab.status === 'complete') {
        cleanup();
        resolve();
      }
    }, error => {
      cleanup();
      reject(error);
    });
  });
}
