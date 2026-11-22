import { ChannelId, ChannelUsageResult, ExtensionSettings } from '../types/usage';
import { antigravityProvider } from './antigravity';
import { geminiWebProvider } from './geminiWeb';
import { tencentTokenHubProvider } from './tencentTokenHub';
import { tencentTokenProvider } from './tencentToken';
import { ChannelProvider, ProviderDeps } from './types';

export const CHANNEL_PROVIDERS: ChannelProvider[] = [
  antigravityProvider,
  geminiWebProvider,
  tencentTokenHubProvider,
  tencentTokenProvider,
];

export function getProviderById(channelId: ChannelId): ChannelProvider | undefined {
  return CHANNEL_PROVIDERS.find((p) => p.id === channelId);
}

export function getOrderedProviders(channelOrder?: ChannelId[]): ChannelProvider[] {
  if (!channelOrder || channelOrder.length === 0) {
    return [...CHANNEL_PROVIDERS];
  }
  const rank = new Map<string, number>(channelOrder.map((id, idx) => [id, idx]));
  return [...CHANNEL_PROVIDERS].sort((a, b) => {
    const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return ra - rb;
  });
}

export function sortResultsByChannelOrder(
  results: ChannelUsageResult[],
  channelOrder?: ChannelId[],
): ChannelUsageResult[] {
  if (!channelOrder || channelOrder.length === 0) return results;
  const rank = new Map<string, number>(channelOrder.map((id, idx) => [id, idx]));
  return [...results].sort((a, b) => {
    const ra = rank.get(a.channelId) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.channelId) ?? Number.MAX_SAFE_INTEGER;
    return ra - rb;
  });
}

export async function fetchEnabledChannelsUsage(
  settings: ExtensionSettings,
  deps?: ProviderDeps,
): Promise<ChannelUsageResult[]> {
  const active = getOrderedProviders(settings.channelOrder).filter(
    (p) => settings.enabledChannels[p.id],
  );
  const settled = await Promise.allSettled(
    active.map((provider) => provider.fetchUsage(settings, deps)),
  );

  return settled.map((res, idx) => {
    const provider = active[idx];
    if (res.status === 'fulfilled') return res.value;
    return {
      channelId: provider.id,
      channelName: provider.name,
      status: 'error',
      metrics: [],
      errorMessage:
        res.reason instanceof Error ? res.reason.message : '渠道查询发生未捕获异常',
      updatedAt: (deps?.nowMs ?? Date.now)(),
    };
  });
}
