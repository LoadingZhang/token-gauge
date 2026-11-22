const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export async function sha1Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', encoder.encode(input));
  return toHex(digest);
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return toHex(digest);
}

async function hmacSha256Raw(
  key: string | ArrayBuffer,
  message: string,
): Promise<ArrayBuffer> {
  const keyBytes = typeof key === 'string' ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
}

export interface SapisidCookies {
  sapisid?: string;
  sapisid1p?: string;
  sapisid3p?: string;
}

/**
 * Generates Google's SAPISIDHASH / SAPISID1PHASH / SAPISID3PHASH Authorization header.
 */
export async function buildSapisidAuthHeader(
  cookies: SapisidCookies,
  origin: string,
  timestampSec = Math.floor(Date.now() / 1000),
): Promise<string> {
  const parts: string[] = [];

  if (cookies.sapisid) {
    const hash = await sha1Hex(`${timestampSec} ${cookies.sapisid} ${origin}`);
    parts.push(`SAPISIDHASH ${timestampSec}_${hash}`);
  }
  const p1 = cookies.sapisid1p || cookies.sapisid;
  if (p1) {
    const hash = await sha1Hex(`${timestampSec} ${p1} ${origin}`);
    parts.push(`SAPISID1PHASH ${timestampSec}_${hash}`);
  }
  const p3 = cookies.sapisid3p || cookies.sapisid;
  if (p3) {
    const hash = await sha1Hex(`${timestampSec} ${p3} ${origin}`);
    parts.push(`SAPISID3PHASH ${timestampSec}_${hash}`);
  }

  return parts.join(' ');
}

export interface TencentSignParams {
  secretId: string;
  secretKey: string;
  host: string;
  service: string;
  action: string;
  version: string;
  region?: string;
  payload: string;
  timestampSec?: number;
}

/**
 * Signs a Tencent Cloud API v3 request using TC3-HMAC-SHA256 via Web Crypto.
 */
export async function signTencentCloudV3(
  params: TencentSignParams,
): Promise<Record<string, string>> {
  const timestamp = params.timestampSec ?? Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const contentType = 'application/json; charset=utf-8';

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${params.host}\n` +
    `x-tc-action:${params.action.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const hashedPayload = await sha256Hex(params.payload);

  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join('\n');

  const credentialScope = `${date}/${params.service}/tc3_request`;
  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    credentialScope,
    hashedCanonicalRequest,
  ].join('\n');

  const secretDate = await hmacSha256Raw(`TC3${params.secretKey}`, date);
  const secretService = await hmacSha256Raw(secretDate, params.service);
  const secretSigning = await hmacSha256Raw(secretService, 'tc3_request');
  const signature = toHex(await hmacSha256Raw(secretSigning, stringToSign));

  const authorization =
    `TC3-HMAC-SHA256 Credential=${params.secretId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'X-TC-Action': params.action,
    'X-TC-Version': params.version,
    'X-TC-Timestamp': String(timestamp),
    Authorization: authorization,
  };
  if (params.region) {
    headers['X-TC-Region'] = params.region;
  }
  return headers;
}
