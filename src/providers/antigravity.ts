import { ChannelUsageResult, ExtensionSettings, QuotaMetric } from '../types/usage';
import { buildSapisidAuthHeader, SapisidCookies } from '../utils/crypto';
import { clampPercent, formatPercent } from '../utils/format';
import { ChannelProvider, CookieReader, defaultCookieReader, ProviderDeps } from './types';

const ANTIGRAVITY_ENDPOINT =
  'https://aicode.clients6.google.com/$rpc/google.gca.aicode.v1alpha.JetskiRemoteAgentProxyService/GetUserQuotaSummary';
const ANTIGRAVITY_ORIGIN = 'https://antigravity.google.com';

const COOKIE_URLS = [
  'https://aicode.clients6.google.com',
  'https://antigravity.google.com',
  'https://www.google.com',
];

// Select the RPC client key, not the unrelated Feedback or Firebase client keys.
export function extractAntigravityApiKey(source: string): string | undefined {
  return /ConfigService\.API_KEY\s*=\s*["'](AIza[\w-]{35})["']/.exec(source)?.[1];
}

export async function discoverAntigravityApiKey(fetchFn: typeof fetch): Promise<string | undefined> {
  const home = await fetchFn(`${ANTIGRAVITY_ORIGIN}/`, {
    credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(15_000),
  });
  if (!home.ok) throw new Error(`Antigravity 页面请求失败 (HTTP ${home.status})`);
  const html = await home.text();
  const inlineKey = extractAntigravityApiKey(html);
  if (inlineKey) return inlineKey;
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)]
    .map(match => new URL(match[1].replaceAll('&amp;', '&'), ANTIGRAVITY_ORIGIN))
    .filter(url => url.origin === 'https://www.gstatic.com' && url.pathname.includes('/boq-jetski/'));
  for (const url of scripts.slice(0, 3)) {
    const response = await fetchFn(url.toString(), { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) continue;
    const key = extractAntigravityApiKey(await response.text());
    if (key) return key;
  }
  return undefined;
}

let discoveredKeyPromise: Promise<string | undefined> | undefined;

function getDiscoveredKey(fetchFn: typeof fetch, useCache: boolean): Promise<string | undefined> {
  if (!useCache) return discoverAntigravityApiKey(fetchFn);
  if (!discoveredKeyPromise) {
    discoveredKeyPromise = discoverAntigravityApiKey(fetchFn).then(key => {
      if (!key) discoveredKeyPromise = undefined;
      return key;
    }, error => {
      discoveredKeyPromise = undefined;
      throw error;
    });
  }
  return discoveredKeyPromise;
}

function epochSecToIso(raw: unknown): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const sec = Number(raw);
  if (!Number.isFinite(sec) || sec <= 0) return undefined;
  return new Date(sec * 1000).toISOString();
}

function windowSortRank(windowType: string): number {
  if (windowType === '5h') return 0;
  if (windowType === 'weekly') return 1;
  return 2;
}

function mapWindowLabel(windowType: string, fallbackTitle: string): string {
  if (windowType === '5h') return '5 小时窗口';
  if (windowType === 'weekly') return '周窗口';
  return fallbackTitle || windowType || '配额窗口';
}

/**
 * Parses Antigravity's application/json+protobuf positional array payload.
 */
export function parseAntigravityQuota(
  payload: unknown,
  updatedAt = Date.now(),
): ChannelUsageResult {
  const baseResult: Omit<ChannelUsageResult, 'status' | 'metrics'> = {
    channelId: 'antigravity',
    channelName: 'Antigravity',
    loginUrl: ANTIGRAVITY_ORIGIN,
    updatedAt,
    rawPayload: payload,
  };

  if (!Array.isArray(payload)) {
    return {
      ...baseResult,
      status: 'error',
      metrics: [],
      errorMessage: 'Antigravity 响应格式异常（非数组结构）',
    };
  }

  const container = (payload as unknown[][])[0]?.[0];
  if (!Array.isArray(container) || !Array.isArray(container[1])) {
    return {
      ...baseResult,
      status: 'error',
      metrics: [],
      errorMessage: '未在 Antigravity 响应中解析到配额分组数据',
    };
  }

  const groups = container[1] as unknown[];
  const metrics: QuotaMetric[] = [];

  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    const rawQuotas = Array.isArray(group[0]) ? group[0] : [];
    const groupName = typeof group[1] === 'string' ? group[1] : '默认分组';

    const sortedQuotas = [...rawQuotas]
      .filter((item): item is unknown[] => Array.isArray(item))
      .sort((a, b) => windowSortRank(String(a[2] ?? '')) - windowSortRank(String(b[2] ?? '')));

    for (const q of sortedQuotas) {
      const id = String(q[0] ?? `${groupName}-${metrics.length}`);
      const title = String(q[1] ?? '');
      const windowType = String(q[2] ?? '');
      const remainingFraction = Number(q[3]);
      if (!Number.isFinite(remainingFraction)) continue;

      const remainingPercent = clampPercent(remainingFraction * 100);
      const usedPercent = clampPercent(100 - remainingPercent);
      const resetSec = Array.isArray(q[5]) ? q[5][0] : undefined;

      metrics.push({
        id,
        groupName,
        label: mapWindowLabel(windowType, title),
        usedPercent,
        usedDisplay: formatPercent(usedPercent),
        remainingDisplay: formatPercent(remainingPercent),
        resetAt: epochSecToIso(resetSec),
      });
    }
  }

  if (metrics.length === 0) {
    return {
      ...baseResult,
      status: 'error',
      metrics: [],
      errorMessage: 'Antigravity 返回的配额列表为空',
    };
  }

  return {
    ...baseResult,
    status: 'ok',
    metrics,
  };
}

async function readGoogleSapisidCookies(reader: CookieReader): Promise<SapisidCookies> {
  const result: SapisidCookies = {};
  for (const url of COOKIE_URLS) {
    if (!result.sapisid) result.sapisid = await reader.getCookie(url, 'SAPISID');
    if (!result.sapisid1p) result.sapisid1p = await reader.getCookie(url, '__Secure-1PAPISID');
    if (!result.sapisid3p) result.sapisid3p = await reader.getCookie(url, '__Secure-3PAPISID');
    if (result.sapisid && result.sapisid1p && result.sapisid3p) break;
  }
  return result;
}

export const antigravityProvider: ChannelProvider = {
  id: 'antigravity',
  name: 'Antigravity',
  description: '通过浏览器 Google Cookie 调用 GetUserQuotaSummary',
  authType: 'cookie',

  async fetchUsage(
    settings: ExtensionSettings,
    deps: ProviderDeps = {},
  ): Promise<ChannelUsageResult> {
    const fetchFn = deps.fetchFn ?? fetch;
    const cookieReader = deps.cookieReader ?? defaultCookieReader;
    const now = (deps.nowMs ?? Date.now)();

    const cookies = await readGoogleSapisidCookies(cookieReader);
    if (!cookies.sapisid && !cookies.sapisid1p && !cookies.sapisid3p) {
      return {
        channelId: 'antigravity',
        channelName: 'Antigravity',
        status: 'unauthenticated',
        metrics: [],
        loginUrl: ANTIGRAVITY_ORIGIN,
        errorMessage: '未检测到 Google 登录 Cookie（SAPISID），请先在 Edge 登录 Antigravity。',
        updatedAt: now,
      };
    }

    const authorization = await buildSapisidAuthHeader(
      cookies,
      ANTIGRAVITY_ORIGIN,
      Math.floor(now / 1000),
    );

    try {
      const apiKey = settings.antigravity.apiKey.trim() || await getDiscoveredKey(fetchFn, !deps.fetchFn);
      if (!apiKey) {
        return {
          channelId: 'antigravity', channelName: 'Antigravity', status: 'error', metrics: [],
          loginUrl: ANTIGRAVITY_ORIGIN, updatedAt: now,
          errorMessage: '未能从 Antigravity 官方客户端获取查询参数，请打开 Antigravity 页面后刷新插件。',
        };
      }
      const response = await fetchFn(ANTIGRAVITY_ENDPOINT, {
        method: 'POST',
        credentials: 'include',
        headers: {
          accept: '*/*',
          authorization,
          'content-type': 'application/json+protobuf',
          'x-goog-api-key': apiKey,
          'x-goog-authuser': settings.antigravity.authUser || '0',
          'x-user-agent': 'grpc-web-javascript/0.1',
        },
        body: '[]',
        signal: AbortSignal.timeout(15_000),
      });

      if (response.status === 401 || response.status === 403) {
        return {
          channelId: 'antigravity',
          channelName: 'Antigravity',
          status: 'unauthenticated',
          metrics: [],
          loginUrl: ANTIGRAVITY_ORIGIN,
          errorMessage: `Google 会话已过期或未授权 (${response.status})，请重新登录 Antigravity。`,
          updatedAt: now,
        };
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return {
          channelId: 'antigravity',
          channelName: 'Antigravity',
          status: 'error',
          metrics: [],
          loginUrl: ANTIGRAVITY_ORIGIN,
          errorMessage: `请求失败 (${response.status})${text ? `: ${text.slice(0, 120)}` : ''}`,
          updatedAt: now,
        };
      }

      const payload: unknown = await response.json();
      return parseAntigravityQuota(payload, now);
    } catch (error) {
      return {
        channelId: 'antigravity',
        channelName: 'Antigravity',
        status: 'error',
        metrics: [],
        loginUrl: ANTIGRAVITY_ORIGIN,
        errorMessage: error instanceof Error ? error.message : '网络请求异常',
        updatedAt: now,
      };
    }
  },
};
