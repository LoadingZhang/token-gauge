import { describe, expect, it } from 'vitest';
import {
  normalizeTencentTimestamp,
  parseTencentPackageMetric,
  tencentTokenHubProvider,
} from '../src/providers/tencentTokenHub';
import { DEFAULT_SETTINGS, ExtensionSettings } from '../src/types/usage';

const LIVE_PERSONAL_RESPONSE = {
  Response: {
    ProductType: 'personal',
    PackageStatus: 'ACTIVE',
    PkgId: 'pre-tp-gz-personal-00000000000000000000000',
    ResourceId: 'pre-tp-gz-personal-00000000000000000000000',
    TotalCredits: '780',
    TotalUsed: '38.8427159',
    CycleCredits: '780',
    TotalCycles: 1,
    CurrentCycle: 1,
    StartTime: '2026-11-08 13:15:29',
    ExpireTime: '2026-12-08 13:15:28',
    PeriodEndDate: '2026-12-08',
    AutoRenewFlag: 0,
    OutputToken: 426612,
    InputToken: 1981777,
    CacheToken: 44216192,
    RequestId: '00000000-0000-0000-0000-000000000000',
  },
};

describe('normalizeTencentTimestamp', () => {
  it('converts UTC+8 space-separated datetime and date-only strings', () => {
    expect(normalizeTencentTimestamp('2026-12-08 13:15:28')).toBe('2026-12-08T13:15:28+08:00');
    expect(normalizeTencentTimestamp('2026-12-08')).toBe('2026-12-08T23:59:59+08:00');
    expect(normalizeTencentTimestamp('2026-07-15T00:00:00Z')).toBe('2026-07-15T00:00:00Z');
  });
});

describe('parseTencentPackageMetric', () => {
  it('parses live ACTIVE response with decimal credits and exact reset time without detail text', () => {
    const { metric, error } = parseTencentPackageMetric('personal', LIVE_PERSONAL_RESPONSE);
    expect(error).toBeUndefined();
    expect(metric).toBeDefined();
    expect(metric!.label).toBe('TokenPlan 个人版');
    expect(metric!.usedPercent).toBeCloseTo((38.8427159 / 780) * 100, 4);
    expect(metric!.usedDisplay).toBe('38.84');
    expect(metric!.totalDisplay).toBe('780');
    expect(metric!.remainingDisplay).toBe('741.16');
    expect(metric!.statusBadge).toBe('生效中');
    expect(metric!.resetAt).toBe('2026-12-08T13:15:28+08:00');
    expect(metric!.subLabel).toBeUndefined();
  });

  it('handles uppercase UNPURCHASED package cleanly', () => {
    const { metric } = parseTencentPackageMetric('personal-hunyuan', {
      Response: { ProductType: 'personal-hunyuan', PackageStatus: 'UNPURCHASED' },
    });
    expect(metric?.statusBadge).toBe('未购买');
    expect(metric?.usedPercent).toBe(0);
  });

  it('surfaces Tencent Cloud API Error block', () => {
    const { error } = parseTencentPackageMetric('personal', {
      Response: {
        Error: { Code: 'AuthFailure.SignatureFailure', Message: 'The signature is invalid.' },
      },
    });
    expect(error).toContain('AuthFailure.SignatureFailure');
  });
});

describe('tencentTokenHubProvider.fetchUsage', () => {
  it('returns unconfigured when AK/SK are missing', async () => {
    const res = await tencentTokenHubProvider.fetchUsage(DEFAULT_SETTINGS);
    expect(res.status).toBe('unconfigured');
  });

  it('sends X-TC-Region and queries selected productTypes in parallel', async () => {
    const settings: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      tencentTokenHub: {
        secretId: 'AKID_DEMO',
        secretKey: 'SK_DEMO',
        region: 'ap-guangzhou',
        productTypes: ['personal', 'personal-hunyuan'],
      },
    };

    const calls: Array<{ productType: string; region: string | undefined }> = [];
    const res = await tencentTokenHubProvider.fetchUsage(settings, {
      fetchFn: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { ProductType: string };
        const hdrs = init?.headers as Record<string, string>;
        calls.push({ productType: body.ProductType, region: hdrs['X-TC-Region'] });
        return new Response(
          JSON.stringify({
            Response:
              body.ProductType === 'personal'
                ? LIVE_PERSONAL_RESPONSE.Response
                : { ProductType: 'personal-hunyuan', PackageStatus: 'UNPURCHASED' },
          }),
          { status: 200 },
        );
      },
    });

    expect(calls).toHaveLength(2);
    expect(calls).toContainEqual({ productType: 'personal', region: 'ap-guangzhou' });
    expect(calls).toContainEqual({ productType: 'personal-hunyuan', region: 'ap-guangzhou' });
    expect(res.status).toBe('ok');
    expect(res.metrics).toHaveLength(2);
    expect(res.metrics[0].statusBadge).toBe('生效中');
    expect(res.metrics[1].statusBadge).toBe('未购买');
  });
});
