import { describe, expect, it } from 'vitest';
import { antigravityProvider, discoverAntigravityApiKey, extractAntigravityApiKey, parseAntigravityQuota } from '../src/providers/antigravity';
import { vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/types/usage';

const SAMPLE_ANTIGRAVITY_RESPONSE = [
  [
    [
      null,
      [
        [
          [
            [
              'gemini-weekly',
              'Weekly Limit Remaining',
              'weekly',
              0.9802956,
              null,
              ['1795930062'],
              'You have used some of your weekly limit, it will fully refresh in 6 days, 21 hours.',
            ],
            [
              'gemini-5h',
              'Five Hour Limit Remaining',
              '5h',
              0.96717465,
              null,
              ['1795343262'],
              'You have used some of your 5-hour limit, it will fully refresh in 2 hours, 17 minutes.',
            ],
          ],
          'Gemini Models',
          'Models within this group: Gemini 4 Neon, Gemini 4 Hydrogen, Gemini 3.8 Flash',
        ],
        [
          [
            ['3p-weekly', 'Weekly Limit Remaining', 'weekly', 1, null, ['1795939789']],
            ['3p-5h', 'Five Hour Limit Remaining', '5h', 1, null, ['1795352989']],
          ],
          'Claude and GPT models',
          'Models within this group: Claude Opus 5.5, Claude Sonnet 5.5, GPT-OSS 120B',
        ],
        [
          [
            [
              'gemini-argon-wtu-weekly',
              'Gemini 4 Argon Weekly Limit',
              'weekly',
              0.97973335,
              null,
              ['1795936894'],
              'You have used some of your weekly limit, it will fully refresh in 6 days, 23 hours.',
            ],
          ],
          'Gemini 4 Argon',
          'For paid Pro plans, Argon quota is separate.',
        ],
      ],
      'Within each group, models share a weekly limit and a 5-hour limit.',
    ],
  ],
];

describe('parseAntigravityQuota', () => {
  it('parses model groups, sorts 5h before weekly, and converts remaining fraction to usedPercent', () => {
    const res = parseAntigravityQuota(SAMPLE_ANTIGRAVITY_RESPONSE, 1795335000000);
    expect(res.status).toBe('ok');
    expect(res.metrics).toHaveLength(5);

    // First group: Gemini Models -> 5h sorted before weekly
    expect(res.metrics[0].id).toBe('gemini-5h');
    expect(res.metrics[0].groupName).toBe('Gemini Models');
    expect(res.metrics[0].label).toBe('5 小时窗口');
    expect(res.metrics[0].usedPercent).toBeCloseTo(3.282535, 4);
    expect(res.metrics[0].resetAt).toBe(new Date(1795343262 * 1000).toISOString());

    expect(res.metrics[1].id).toBe('gemini-weekly');
    expect(res.metrics[1].label).toBe('周窗口');
    expect(res.metrics[1].usedPercent).toBeCloseTo(1.97044, 4);

    // Second group: Claude and GPT models (100% remaining -> 0% used)
    expect(res.metrics[2].id).toBe('3p-5h');
    expect(res.metrics[2].usedPercent).toBe(0);
    expect(res.metrics[3].id).toBe('3p-weekly');
    expect(res.metrics[3].usedPercent).toBe(0);

    // Third group: Gemini 4 Argon
    expect(res.metrics[4].id).toBe('gemini-argon-wtu-weekly');
    expect(res.metrics[4].groupName).toBe('Gemini 4 Argon');
    expect(res.metrics[4].usedPercent).toBeCloseTo(2.026665, 4);
    expect(res.metrics[0].groupDescription).toBeUndefined();
    expect(res.metrics[0].subLabel).toBeUndefined();
    expect(res.summaryNote).toBeUndefined();
  });

  it('returns error result for invalid payload', () => {
    const res = parseAntigravityQuota({ invalid: true });
    expect(res.status).toBe('error');
    expect(res.metrics).toHaveLength(0);
  });
});

describe('antigravityProvider.fetchUsage', () => {
  const settingsWithKey = {
    ...DEFAULT_SETTINGS,
    antigravity: { ...DEFAULT_SETTINGS.antigravity, apiKey: 'mock-api-key' },
  };

  it('checks login before discovering the public client key', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const res = await antigravityProvider.fetchUsage(DEFAULT_SETTINGS, {
      cookieReader: { getCookie: async () => undefined }, fetchFn,
    });
    expect(res.status).toBe('unauthenticated');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('automatically discovers a missing client key and queries quota without manual configuration', async () => {
    const key = `AIza${'a'.repeat(35)}`;
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('<script src="https://www.gstatic.com/_/mss/boq-jetski/client.js"></script>'))
      .mockResolvedValueOnce(new Response(`ConfigService.API_KEY="${key}";`))
      .mockResolvedValueOnce(Response.json(SAMPLE_ANTIGRAVITY_RESPONSE));
    const result = await antigravityProvider.fetchUsage(DEFAULT_SETTINGS, {
      cookieReader: { getCookie: async () => 'test-cookie' }, fetchFn,
    });
    expect(result.status).toBe('ok');
    expect(fetchFn.mock.calls[2][1]?.headers).toMatchObject({ 'x-goog-api-key': key });
  });

  it('returns unauthenticated when SAPISID cookies are missing', async () => {
    const res = await antigravityProvider.fetchUsage(settingsWithKey, {
      cookieReader: { getCookie: async () => undefined },
    });
    expect(res.status).toBe('unauthenticated');
  });

  it('returns unauthenticated on HTTP 401', async () => {
    const res = await antigravityProvider.fetchUsage(settingsWithKey, {
      cookieReader: { getCookie: async () => 'cookie-val' },
      fetchFn: async () => new Response('Unauthorized', { status: 401 }),
    });
    expect(res.status).toBe('unauthenticated');
  });
});

describe('Antigravity client key discovery', () => {
  it('selects the RPC key instead of other Google client keys', () => {
    const key = `AIza${'a'.repeat(35)}`;
    const other = `AIza${'b'.repeat(35)}`;
    expect(extractAntigravityApiKey(`apiKey: '${other}'; _.Eh.ConfigService.API_KEY = '${key}'`)).toBe(key);
    expect(extractAntigravityApiKey(`apiKey: '${other}'`)).toBeUndefined();
  });

  it('fetches only the official Antigravity script and decodes HTML query separators', async () => {
    const key = `AIza${'a'.repeat(35)}`;
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('<script src="https://evil.example/boq-jetski/key.js"></script><script src="https://www.gstatic.com/_/mss/boq-jetski/client.js?a=1&amp;b=2"></script>'))
      .mockResolvedValueOnce(new Response(`ConfigService.API_KEY="${key}"`));
    expect(await discoverAntigravityApiKey(fetchFn)).toBe(key);
    expect(fetchFn.mock.calls[1][0]).toBe('https://www.gstatic.com/_/mss/boq-jetski/client.js?a=1&b=2');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
