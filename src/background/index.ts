import {
  fetchEnabledChannelsUsage,
  getProviderById,
  sortResultsByChannelOrder,
} from '../providers/registry';
import { tencentTokenHubProvider } from '../providers/tencentTokenHub';
import {
  ChannelUsageResult,
  DEFAULT_SETTINGS,
  RuntimeRequest,
  RuntimeResponse,
} from '../types/usage';
import {
  loadCachedUsage,
  loadSettings,
  saveCachedUsage,
  saveSettings,
} from '../utils/storage';
import { registerAutoCaptureListeners } from './autoCapture';
import { ensureHeaderRules } from './dnr';

registerAutoCaptureListeners();

let rulesReadyPromise: Promise<void> | null = null;

function initRulesOnce(): Promise<void> {
  if (!rulesReadyPromise) {
    rulesReadyPromise = ensureHeaderRules().catch((err) => {
      rulesReadyPromise = null;
      throw err;
    });
  }
  return rulesReadyPromise;
}

chrome.runtime.onInstalled.addListener(() => {
  void initRulesOnce();
});

chrome.runtime.onStartup.addListener(() => {
  void initRulesOnce();
});

async function handleRequest(message: RuntimeRequest): Promise<RuntimeResponse> {
  await initRulesOnce();

  switch (message.type) {
    case 'GET_SETTINGS': {
      const settings = await loadSettings();
      return { ok: true, data: settings };
    }

    case 'SAVE_SETTINGS': {
      await saveSettings(message.settings);
      return { ok: true, data: message.settings };
    }

    case 'TEST_TENCENT_CREDENTIALS': {
      const testResult = await tencentTokenHubProvider.fetchUsage({
        ...DEFAULT_SETTINGS,
        tencentTokenHub: {
          secretId: message.secretId,
          secretKey: message.secretKey,
          region: message.region || DEFAULT_SETTINGS.tencentTokenHub.region,
          productTypes: message.productTypes,
        },
      });
      return { ok: true, data: testResult };
    }

    case 'GET_USAGE': {
      const settings = await loadSettings();
      if (!message.forceRefresh && !message.channelId) {
        const cached = await loadCachedUsage();
        const filtered = sortResultsByChannelOrder(
          cached.filter((item) => settings.enabledChannels[item.channelId as keyof typeof settings.enabledChannels] !== false),
          settings.channelOrder,
        );
        if (filtered.length > 0) {
          return { ok: true, data: filtered };
        }
      }

      if (message.channelId) {
        const provider = getProviderById(message.channelId);
        if (!provider) {
          return { ok: false, error: `未知渠道: ${message.channelId}` };
        }
        const single = await provider.fetchUsage(settings);
        const existing = await loadCachedUsage();
        const merged: ChannelUsageResult[] = [];
        let replaced = false;
        for (const item of existing) {
          if (item.channelId === single.channelId) {
            merged.push(single);
            replaced = true;
          } else {
            merged.push(item);
          }
        }
        if (!replaced) merged.push(single);
        const ordered = sortResultsByChannelOrder(merged, settings.channelOrder);
        await saveCachedUsage(ordered);
        return {
          ok: true,
          data: ordered.map((item) => (item.channelId === single.channelId ? single : item)),
        };
      }

      const results = await fetchEnabledChannelsUsage(settings);
      await saveCachedUsage(results);
      return { ok: true, data: results };
    }
  }
}

chrome.runtime.onMessage.addListener((message: RuntimeRequest, _sender, sendResponse) => {
  handleRequest(message)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : '后台服务异常',
      });
    });
  return true;
});
