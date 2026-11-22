import {
  ChannelId,
  ChannelUsageResult,
  DEFAULT_CHANNEL_ORDER,
  DEFAULT_SETTINGS,
  ExtensionSettings,
} from '../types/usage';

const SETTINGS_KEY = 'token_usage_settings_v1';
const CACHE_KEY = 'token_usage_snapshots_v1';

export function normalizeChannelOrder(order: unknown): ChannelId[] {
  const validSet = new Set<string>(DEFAULT_CHANNEL_ORDER);
  const seen = new Set<ChannelId>();
  const normalized: ChannelId[] = [];

  if (Array.isArray(order)) {
    for (const item of order) {
      if (typeof item === 'string' && validSet.has(item) && !seen.has(item as ChannelId)) {
        seen.add(item as ChannelId);
        normalized.push(item as ChannelId);
      }
    }
  }

  for (const id of DEFAULT_CHANNEL_ORDER) {
    if (!seen.has(id)) {
      normalized.push(id);
    }
  }

  return normalized;
}

export function mergeSettings(
  stored: Partial<ExtensionSettings> | undefined,
): ExtensionSettings {
  return {
    developerMode: stored?.developerMode === true,
    enabledChannels: {
      ...DEFAULT_SETTINGS.enabledChannels,
      ...(stored?.enabledChannels ?? {}),
    },
    channelOrder: normalizeChannelOrder(stored?.channelOrder),
    antigravity: {
      ...DEFAULT_SETTINGS.antigravity,
      ...(stored?.antigravity ?? {}),
    },
    geminiWeb: {
      ...DEFAULT_SETTINGS.geminiWeb,
      ...(stored?.geminiWeb ?? {}),
    },
    tencentTokenHub: {
      ...DEFAULT_SETTINGS.tencentTokenHub,
      ...(stored?.tencentTokenHub ?? {}),
      productTypes:
        stored?.tencentTokenHub?.productTypes ??
        DEFAULT_SETTINGS.tencentTokenHub.productTypes,
    },
  };
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const res = await chrome.storage.local.get(SETTINGS_KEY);
  return mergeSettings(res[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined);
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function loadCachedUsage(): Promise<ChannelUsageResult[]> {
  const res = await chrome.storage.local.get(CACHE_KEY);
  const cached = res[CACHE_KEY];
  return Array.isArray(cached) ? (cached as ChannelUsageResult[]) : [];
}

export async function saveCachedUsage(results: ChannelUsageResult[]): Promise<void> {
  // Strip rawPayload before persisting to keep chrome.storage.local lightweight.
  const sanitized = results.map(({ rawPayload: _raw, ...rest }) => rest);
  await chrome.storage.local.set({ [CACHE_KEY]: sanitized });
}
