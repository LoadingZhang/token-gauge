import { describe, expect, it } from 'vitest';
import { getOrderedProviders, sortResultsByChannelOrder } from '../src/providers/registry';
import { ChannelUsageResult, ExtensionSettings } from '../src/types/usage';
import { mergeSettings, normalizeChannelOrder } from '../src/utils/storage';

describe('channel order normalization and sorting', () => {
  it('deduplicates, removes invalid IDs, and appends missing channels', () => {
    expect(
      normalizeChannelOrder(['tencent-tokenhub', 'unknown-id', 'tencent-tokenhub']),
    ).toEqual(['tencent-tokenhub', 'antigravity', 'gemini-web', 'tencent-token']);

    expect(normalizeChannelOrder(undefined)).toEqual([
      'antigravity',
      'gemini-web',
      'tencent-tokenhub',
      'tencent-token',
    ]);
  });

  it('orders providers according to custom channelOrder', () => {
    const providers = getOrderedProviders(['gemini-web', 'tencent-tokenhub', 'antigravity']);
    expect(providers.map((p) => p.id)).toEqual([
      'gemini-web',
      'tencent-tokenhub',
      'antigravity',
      'tencent-token',
    ]);
  });

  it('enables the new channel when loading older settings and preserves channel preferences', () => {
    const settings = mergeSettings({
      enabledChannels: { antigravity: false, 'gemini-web': true, 'tencent-tokenhub': false },
      channelOrder: ['gemini-web', 'antigravity', 'tencent-tokenhub'],
    } as Partial<ExtensionSettings>);
    expect(settings.enabledChannels).toEqual({
      antigravity: false,
      'gemini-web': true,
      'tencent-tokenhub': false,
      'tencent-token': true,
    });
    expect(settings.channelOrder).toEqual(['gemini-web', 'antigravity', 'tencent-tokenhub', 'tencent-token']);
  });

  it('orders cached usage results according to channelOrder', () => {
    const mockResults: ChannelUsageResult[] = [
      { channelId: 'antigravity', channelName: 'Antigravity', status: 'ok', metrics: [], updatedAt: 1 },
      { channelId: 'gemini-web', channelName: 'Gemini Web', status: 'ok', metrics: [], updatedAt: 1 },
      { channelId: 'tencent-tokenhub', channelName: '腾讯云 TokenHub', status: 'ok', metrics: [], updatedAt: 1 },
    ];

    const sorted = sortResultsByChannelOrder(mockResults, [
      'tencent-tokenhub',
      'gemini-web',
      'antigravity',
    ]);
    expect(sorted.map((r) => r.channelId)).toEqual([
      'tencent-tokenhub',
      'gemini-web',
      'antigravity',
    ]);
  });
});
