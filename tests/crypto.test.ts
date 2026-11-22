import { describe, expect, it } from 'vitest';
import { buildSapisidAuthHeader, signTencentCloudV3 } from '../src/utils/crypto';

describe('buildSapisidAuthHeader', () => {
  it('matches Google SAPISIDHASH / SAPISID1PHASH / SAPISID3PHASH format', async () => {
    const header = await buildSapisidAuthHeader(
      {
        sapisid: 'mock_sapisid_value',
        sapisid1p: 'mock_sapisid_value',
        sapisid3p: 'mock_sapisid_value',
      },
      'https://antigravity.google.com',
      1795334989,
    );

    expect(header).toBe(
      'SAPISIDHASH 1795334989_1f868d8d23068a283e4d7683d2bc1b1ace340481 ' +
        'SAPISID1PHASH 1795334989_1f868d8d23068a283e4d7683d2bc1b1ace340481 ' +
        'SAPISID3PHASH 1795334989_1f868d8d23068a283e4d7683d2bc1b1ace340481',
    );
  });

  it('falls back to sapisid when 1P/3P cookies are absent', async () => {
    const header = await buildSapisidAuthHeader(
      { sapisid: 'test_sapisid' },
      'https://antigravity.google.com',
      1700000000,
    );
    expect(header).toContain('SAPISIDHASH 1700000000_');
    expect(header).toContain('SAPISID1PHASH 1700000000_');
    expect(header).toContain('SAPISID3PHASH 1700000000_');
  });
});

describe('signTencentCloudV3', () => {
  it('computes exact TC3-HMAC-SHA256 signature for TokenHub DescribeTokenPlanPersonalPackage', async () => {
    const secretId = 'AKID_TEST_ID';
    const secretKey = 'SECRET_TEST_KEY';
    const host = 'tokenhub.tencentcloudapi.com';
    const service = 'tokenhub';
    const action = 'DescribeTokenPlanPersonalPackage';
    const version = '2026-03-22';
    const payload = JSON.stringify({ ProductType: 'personal' });
    const timestampSec = 1795334400; // 2026-11-22T08:00:00Z

    const headers = await signTencentCloudV3({
      secretId,
      secretKey,
      host,
      service,
      action,
      version,
      region: 'ap-guangzhou',
      payload,
      timestampSec,
    });

    expect(headers['X-TC-Action']).toBe(action);
    expect(headers['X-TC-Version']).toBe(version);
    expect(headers['X-TC-Region']).toBe('ap-guangzhou');
    expect(headers['X-TC-Timestamp']).toBe(String(timestampSec));
    expect(headers.Authorization).toBe(
      `TC3-HMAC-SHA256 Credential=${secretId}/2026-11-22/tokenhub/tc3_request, ` +
        'SignedHeaders=content-type;host;x-tc-action, ' +
        'Signature=d4ca26390a4128a9895c8b1204a1b68070c196683c721a1ddff355dcfa5a9b13',
    );
  });
});
