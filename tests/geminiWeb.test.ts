import { describe, expect, it, vi } from 'vitest';
import { extractCapturedPatch } from '../src/background/autoCapture';
import {
  geminiWebProvider,
  parseGeminiWebQuota,
  stripGoogleXssiPrefix,
} from '../src/providers/geminiWeb';
import { DEFAULT_SETTINGS } from '../src/types/usage';
import { mergeSettings } from '../src/utils/storage';

const CONFIGURED_SETTINGS = mergeSettings({
  geminiWeb: {
    querySignature: 'mock-query-signature=',
    extHeaderBin: 'mock-client-header',
  },
});

const SAMPLE_GEMINI_RESPONSE = [
  {
    data: {
      viewer: {
        rpcs: {
          getUsageInfo: {
            subscriptionTier: 'TIER1',
            pools: [
              {
                poolType: 'GXU_WEEKLY',
                percentageUsed: 0.03946174,
                gxu: { windowRefreshesAt: '2026-11-24T05:17:01.918694Z' },
              },
              {
                poolType: 'GXU_FIVE_HOURLY',
                percentageUsed: 0.06,
                gxu: { windowRefreshesAt: '2026-11-22T12:17:01.918575Z' },
              },
            ],
          },
        },
      },
    },
    path: [],
  },
  {
    data: { __typename: 'Viewer' },
    path: ['viewer', '__defer__:3:UsagePage_viewer'],
  },
];

describe('stripGoogleXssiPrefix', () => {
  it("strips )]}' prefix before JSON", () => {
    const cleaned = stripGoogleXssiPrefix(")]}'\n[{\"ok\":true}]");
    expect(JSON.parse(cleaned)).toEqual([{ ok: true }]);
  });
});

describe('parseGeminiWebQuota', () => {
  it('parses subscriptionTier and sorts 5h window before weekly window', () => {
    const res = parseGeminiWebQuota(SAMPLE_GEMINI_RESPONSE, 1795335000000);
    expect(res.status).toBe('ok');
    expect(res.tierBadge).toBe('TIER1');
    expect(res.metrics).toHaveLength(2);

    expect(res.metrics[0].id).toBe('GXU_FIVE_HOURLY');
    expect(res.metrics[0].label).toBe('5 小时窗口');
    expect(res.metrics[0].usedPercent).toBeCloseTo(6, 4);
    expect(res.metrics[0].usedDisplay).toBe('6%');
    expect(res.metrics[0].remainingDisplay).toBe('94%');
    expect(res.metrics[0].resetAt).toBe('2026-11-22T12:17:01.918575Z');

    expect(res.metrics[1].id).toBe('GXU_WEEKLY');
    expect(res.metrics[1].label).toBe('周窗口');
    expect(res.metrics[1].usedPercent).toBeCloseTo(3.946174, 4);
    expect(res.metrics[1].usedDisplay).toBe('3.9%');
  });

  it('marks unauthenticated when getUsageInfo is absent', () => {
    const res = parseGeminiWebQuota([{ data: { viewer: {} } }]);
    expect(res.status).toBe('unauthenticated');
  });
});

describe('geminiWebProvider.fetchUsage', () => {
  it.each([
    { querySignature: '', extHeaderBin: '' },
    { querySignature: 'mock-query-signature=', extHeaderBin: '' },
    { querySignature: '', extHeaderBin: 'mock-client-header' },
  ])('guides parameter capture without sending an incomplete request: %j', async (geminiWeb) => {
    const fetchFn = vi.fn();
    const res = await geminiWebProvider.fetchUsage({ ...DEFAULT_SETTINGS, geminiWeb }, {
      fetchFn,
      nowMs: () => 123,
    });

    expect(res.status).toBe('unauthenticated');
    expect(res.metrics).toEqual([]);
    expect(res.loginUrl).toBe('https://gemini.google.com');
    expect(res.errorMessage).toContain('自动获取参数');
    expect(res.updatedAt).toBe(123);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('queries usage using parameters captured from a browser request with initially empty settings', async () => {
    const initialSettings = mergeSettings(undefined);
    expect(initialSettings.geminiWeb).toEqual({ querySignature: '', extHeaderBin: '' });
    const patch = extractCapturedPatch({
      url: 'https://gemini.google.com/_/BardChatUi/graphql/schemas/GEMINI_WEB_GRAPHQL/executeQuery' +
        '?query_signature=mock-query-signature%3D&variables=GEMINI_USAGE_SETTINGS_UPGRADE_BANNER',
      tabId: 1,
      initiator: 'https://gemini.google.com',
      requestHeaders: [{ name: 'x-goog-ext-525001261-bin', value: 'mock-client-header' }],
    });
    const settings = mergeSettings({
      ...initialSettings,
      geminiWeb: { ...initialSettings.geminiWeb, ...patch?.geminiWeb },
    });
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(SAMPLE_GEMINI_RESPONSE)));
    const res = await geminiWebProvider.fetchUsage(settings, { fetchFn });

    expect(res.status).toBe('ok');
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, options] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).searchParams.get('query_signature')).toBe('mock-query-signature=');
    expect(options.credentials).toBe('include');
    expect(new Headers(options.headers).get('x-goog-ext-525001261-bin')).toBe('mock-client-header');
  });

  it('handles XSSI prefixed response cleanly', async () => {
    const res = await geminiWebProvider.fetchUsage(CONFIGURED_SETTINGS, {
      fetchFn: async () =>
        new Response(`)]}'\n${JSON.stringify(SAMPLE_GEMINI_RESPONSE)}`, { status: 200 }),
    });
    expect(res.status).toBe('ok');
    expect(res.metrics).toHaveLength(2);
  });

  it('handles HTTP 403 as unauthenticated', async () => {
    const res = await geminiWebProvider.fetchUsage(CONFIGURED_SETTINGS, {
      fetchFn: async () => new Response('Forbidden', { status: 403 }),
    });
    expect(res.status).toBe('unauthenticated');
  });
});
