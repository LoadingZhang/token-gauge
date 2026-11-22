import { describe, expect, it, vi } from 'vitest';
import { extractTencentPageToken, parseTencentTokenQuota, tencentTokenProvider } from '../src/providers/tencentToken';
import { DEFAULT_SETTINGS } from '../src/types/usage';

// Sanitized query-quota shape; no real account identifiers or session tokens.
const QUOTA_RESPONSE = {
  success: true,
  quota_visible: true,
  quota_disabled: false,
  total_usage_rate: 25,
  total_used: 250,
  total_quota: 1000,
  personal: { quota: 1000, used: 250, usage_rate: 25, quota_unlimited: false },
  product_used: 50,
  product_quota: 100,
  group_usage_rate: 50,
  remaining_percentage: 75,
};

describe('extractTencentPageToken', () => {
  it('reads only the pt meta tag regardless of attribute order, quotes, or capitalization', () => {
    expect(extractTencentPageToken('<meta name="viewport" content="ignored"><meta content=\'test-page-token\' NAME=\'pt\' />'))
      .toBe('test-page-token');
    expect(extractTencentPageToken('<META name="pt" content="fresh-token">')).toBe('fresh-token');
    expect(extractTencentPageToken('<meta name="pt" content="">')).toBeUndefined();
    expect(extractTencentPageToken('<html>OA 登录</html>')).toBeUndefined();
  });
});

describe('parseTencentTokenQuota', () => {
  it('uses the personal monthly rate in percentage units and shows RMB amounts', () => {
    const result = parseTencentTokenQuota(QUOTA_RESPONSE, 123);
    expect(result).toMatchObject({ channelId: 'tencent-token', status: 'ok', updatedAt: 123 });
    expect(result.metrics).toHaveLength(1);
    expect(result.metrics[0]).toMatchObject({
      usedPercent: 25, usedDisplay: '¥250.00', totalDisplay: '¥1,000.00', remainingDisplay: '¥750.00',
    });
    expect(result.metrics[0].resetAt).toBeUndefined();
  });

  it('preserves decimal percentages and computes them when the rate is absent', () => {
    const personal = { quota: '1000', used: '552.164', usage_rate: '55.2164' };
    expect(parseTencentTokenQuota({ ...QUOTA_RESPONSE, personal }).metrics[0].usedPercent).toBe(55.2164);
    expect(parseTencentTokenQuota({ ...QUOTA_RESPONSE, personal: { quota: 1000, used: 250 } }).metrics[0].usedPercent).toBe(25);
  });

  it('supports the total fields when the personal block is absent', () => {
    expect(parseTencentTokenQuota({ ...QUOTA_RESPONSE, personal: undefined }).metrics[0].usedPercent).toBe(25);
  });

  it('clamps exhausted quotas and remaining amounts', () => {
    const result = parseTencentTokenQuota({ ...QUOTA_RESPONSE, personal: { quota: 100, used: 150, usage_rate: 150 } });
    expect(result.metrics[0]).toMatchObject({ usedPercent: 100, remainingDisplay: '¥0.00' });
  });

  it('handles zero spending and zero quota without NaN', () => {
    expect(parseTencentTokenQuota({ ...QUOTA_RESPONSE, personal: { quota: 1000, used: 0, usage_rate: 0 } }).metrics[0].usedPercent).toBe(0);
    expect(parseTencentTokenQuota({ ...QUOTA_RESPONSE, personal: { quota: 0, used: 0 } }).metrics[0])
      .toMatchObject({ usedPercent: 0, statusBadge: '无额度' });
  });

  it.each([
    { ...QUOTA_RESPONSE, quota_visible: false },
    { ...QUOTA_RESPONSE, quota_disabled: true },
    { ...QUOTA_RESPONSE, personal: { ...QUOTA_RESPONSE.personal, quota_unlimited: true } },
    { ...QUOTA_RESPONSE, personal: {} },
    { ...QUOTA_RESPONSE, personal: { quota: null, used: 0 } },
    { ...QUOTA_RESPONSE, personal: { quota: 100, used: -1 } },
    { ...QUOTA_RESPONSE, personal: { quota: 'bad', used: 0 } },
    null,
  ])('does not fabricate percentages for unavailable or invalid quotas (%#)', (payload) => {
    expect(parseTencentTokenQuota(payload)).toMatchObject({ status: 'error', metrics: [] });
  });

  it('reports API failures and rate limiting', () => {
    expect(parseTencentTokenQuota({ success: false, message: '配额服务暂不可用' }).errorMessage).toBe('配额服务暂不可用');
    expect(parseTencentTokenQuota({ success: false, code: '260429' }).errorMessage).toContain('刷新过于频繁');
  });
});

describe('tencentTokenProvider.fetchUsage', () => {
  it('queries the API in the background without using or opening a site tab', async () => {
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('<meta name="pt" content="test-page-token">'))
      .mockResolvedValueOnce(Response.json(QUOTA_RESPONSE));
    const pageQuery = vi.fn().mockResolvedValue({ status: 200, payload: QUOTA_RESPONSE });
    const result = await tencentTokenProvider.fetchUsage(DEFAULT_SETTINGS, { fetchFn, tencentPageQuery: pageQuery });
    expect(result.status).toBe('ok');
    expect(pageQuery).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('recovers a rejected background session using an inactive site tab', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 403 }));
    const pageQuery = vi.fn().mockResolvedValue({ status: 200, payload: QUOTA_RESPONSE });
    const result = await tencentTokenProvider.fetchUsage(DEFAULT_SETTINGS, { fetchFn, tencentPageQuery: pageQuery });
    expect(result.status).toBe('ok');
    expect(pageQuery.mock.calls).toEqual([[true]]);
  });

  it('falls back to a site tab only when the direct quota API rejects the session', async () => {
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('<meta name="pt" content="test-page-token">'))
      .mockResolvedValueOnce(new Response('', { status: 403 }));
    const pageQuery = vi.fn().mockResolvedValue({ status: 200, payload: QUOTA_RESPONSE });
    expect((await tencentTokenProvider.fetchUsage(DEFAULT_SETTINGS, { fetchFn, tencentPageQuery: pageQuery })).status).toBe('ok');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(pageQuery).toHaveBeenCalledTimes(1);
  });

  it('reports login expiration when both background and site session are rejected', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 403 }));
    const pageQuery = vi.fn().mockResolvedValue({ status: 401 });
    expect((await tencentTokenProvider.fetchUsage(DEFAULT_SETTINGS, { fetchFn, tencentPageQuery: pageQuery })).status).toBe('unauthenticated');
  });
  it('fetches a fresh page token with session cookies and uses it only for the quota request', async () => {
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('<meta name="pt" content="test-page-token">'))
      .mockResolvedValueOnce(Response.json(QUOTA_RESPONSE));
    const result = await tencentTokenProvider.fetchUsage(DEFAULT_SETTINGS, { fetchFn, nowMs: () => 123 });
    expect(result.status).toBe('ok');
    expect(fetchFn).toHaveBeenNthCalledWith(1, 'https://token.woa.com/', expect.objectContaining({
      credentials: 'include', cache: 'no-store', redirect: 'manual',
    }));
    expect(fetchFn).toHaveBeenNthCalledWith(2, 'https://token.woa.com/api/query-quota?platform=all', expect.objectContaining({
      method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'manual',
      headers: { accept: 'application/json', 'X-Page-Token': 'test-page-token' },
    }));
    expect(JSON.stringify(result)).not.toContain('test-page-token');
  });

  it.each([401, 403, 302])('returns a login action for an unauthenticated homepage (HTTP %i)', async (status) => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status }));
    const result = await tencentTokenProvider.fetchUsage(DEFAULT_SETTINGS, { fetchFn });
    expect(result).toMatchObject({ status: 'unauthenticated', metrics: [], loginUrl: 'https://token.woa.com/' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('recognizes browser opaque redirects without following the OA login flow', async () => {
    const response = new Response();
    Object.defineProperty(response, 'type', { value: 'opaqueredirect' });
    const result = await tencentTokenProvider.fetchUsage(DEFAULT_SETTINGS, { fetchFn: vi.fn<typeof fetch>().mockResolvedValue(response) });
    expect(result.status).toBe('unauthenticated');
  });

  it('does not query quotas when the homepage has no page token', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>OA 登录</html>'));
    expect((await tencentTokenProvider.fetchUsage(DEFAULT_SETTINGS, { fetchFn })).status).toBe('unauthenticated');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403])('handles a session expiring between the two requests (HTTP %i)', async (status) => {
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('<meta name="pt" content="test-token">'))
      .mockResolvedValueOnce(new Response('', { status }));
    expect((await tencentTokenProvider.fetchUsage(DEFAULT_SETTINGS, { fetchFn })).status).toBe('unauthenticated');
  });

  it('recognizes HTML login responses instead of attempting JSON parsing', async () => {
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('<meta name="pt" content="test-token">'))
      .mockResolvedValueOnce(new Response('<html>OA 登录</html>', { headers: { 'content-type': 'text/html' } }));
    expect((await tencentTokenProvider.fetchUsage(DEFAULT_SETTINGS, { fetchFn })).status).toBe('unauthenticated');
  });

  it('reports HTTP failures without including response contents or session tokens', async () => {
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('<meta name="pt" content="secret-token">'))
      .mockResolvedValueOnce(new Response('sensitive error contents', { status: 500 }));
    const result = await tencentTokenProvider.fetchUsage(DEFAULT_SETTINGS, { fetchFn });
    expect(result.status).toBe('error');
    expect(result.errorMessage).toContain('HTTP 500');
    expect(JSON.stringify(result)).not.toContain('sensitive');
    expect(JSON.stringify(result)).not.toContain('secret-token');
  });

  it('reports network failures as channel errors', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new Error('Network unavailable'));
    expect(await tencentTokenProvider.fetchUsage(DEFAULT_SETTINGS, { fetchFn }))
      .toMatchObject({ status: 'error', metrics: [], errorMessage: 'Network unavailable' });
  });
});
