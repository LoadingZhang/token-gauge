import { ChannelUsageResult, ExtensionSettings } from '../types/usage';
import { clampPercent } from '../utils/format';
import { ChannelProvider, ProviderDeps } from './types';
import { runInSiteTab } from './siteTab';

const TOKEN_ORIGIN = 'https://token.woa.com';
const TOKEN_HOME_URL = `${TOKEN_ORIGIN}/`;
const TOKEN_QUOTA_URL = `${TOKEN_ORIGIN}/api/query-quota?platform=all`;
const LOGIN_MESSAGE = '鹅厂 Token未登录或会话已过期，请先在当前浏览器打开 token.woa.com 完成 OA 登录。';

// Service workers have no DOMParser. Only read the named meta tag, never store its token.
export function extractTencentPageToken(html: string): string | undefined {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = new Map<string, string>();
    for (const match of tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attributes.set(match[1].toLowerCase(), match[2] ?? match[3]);
    }
    if (attributes.get('name') === 'pt') {
      return attributes.get('content')?.trim() || undefined;
    }
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function quotaNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function formatRmb(value: number): string {
  return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function baseResult(updatedAt: number): Omit<ChannelUsageResult, 'status' | 'metrics'> {
  return {
    channelId: 'tencent-token',
    channelName: '鹅厂 Token',
    loginUrl: TOKEN_HOME_URL,
    updatedAt,
  };
}

export function parseTencentTokenQuota(
  payload: unknown,
  updatedAt = Date.now(),
): ChannelUsageResult {
  const base = { ...baseResult(updatedAt), rawPayload: payload };
  const body = asRecord(payload);
  const errorResult = (errorMessage: string): ChannelUsageResult => ({
    ...base, status: 'error', metrics: [], errorMessage,
  });

  if (!body || body.success !== true) {
    const message = typeof body?.message === 'string' ? body.message : '鹅厂 Token配额查询失败，请稍后刷新。';
    return errorResult(String(body?.code) === '260429' ? '刷新过于频繁，请稍后再试。' : message);
  }

  const personal = asRecord(body.personal);
  if (body.quota_disabled === true || personal?.quota_unlimited === true) {
    return errorResult('当前账号为无限额度，无法计算用量百分比。');
  }
  if (body.quota_visible === false) {
    return errorResult('当前账号的额度已隐藏，无法计算用量百分比。');
  }

  // The dashboard uses personal.usage_rate (already 0–100), not the product quota rate.
  const used = quotaNumber(personal ? personal.used : body.total_used);
  const total = quotaNumber(personal ? personal.quota : body.total_quota);
  const rate = quotaNumber(personal ? personal.usage_rate : body.total_usage_rate);
  if (used === undefined || total === undefined) {
    return errorResult('鹅厂 Token未返回有效的本月已用费用或额度，请稍后刷新。');
  }
  const usedPercent = clampPercent(rate ?? (total > 0 ? used / total * 100 : used > 0 ? 100 : 0));

  return {
    ...base,
    status: 'ok',
    metrics: [{
      id: 'tencent-token-monthly',
      label: '本月费用额度',
      usedPercent,
      usedDisplay: formatRmb(used),
      totalDisplay: formatRmb(total),
      remainingDisplay: formatRmb(Math.max(0, total - used)),
      statusBadge: total === 0 ? '无额度' : undefined,
      // query-quota supplies no reset timestamp; do not invent one.
    }],
  };
}

function isUnauthenticated(response: Response): boolean {
  return response.status === 401 || response.status === 403 ||
    response.type === 'opaqueredirect' ||
    (response.status >= 300 && response.status < 400) ||
    Boolean(response.url && new URL(response.url).origin !== TOKEN_ORIGIN);
}

// This function is serialized by chrome.scripting; keep it self-contained.
export async function queryTencentQuotaInPage(): Promise<{
  status: number; payload?: unknown; error?: string;
}> {
  if (location.origin !== 'https://token.woa.com') return { status: 401 };
  try {
    const home = await fetch('/', {
      credentials: 'include', cache: 'no-store', redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    if (home.type === 'opaqueredirect') return { status: 401 };
    if (!home.ok) return { status: home.status };
    const html = new DOMParser().parseFromString(await home.text(), 'text/html');
    const token = html.querySelector<HTMLMetaElement>('meta[name="pt"]')?.content;
    if (!token) return { status: 401 };
    const response = await fetch('/api/query-quota?platform=all', {
      credentials: 'include', cache: 'no-store', redirect: 'manual',
      headers: { accept: 'application/json', 'X-Page-Token': token },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.type === 'opaqueredirect' || response.headers.get('content-type')?.includes('text/html')) {
      return { status: 401 };
    }
    if (!response.ok) return { status: response.status };
    return { status: response.status, payload: await response.json() };
  } catch {
    return { status: 0, error: '鹅厂 Token页面查询失败，请打开看板后刷新。' };
  }
}

export const tencentTokenProvider: ChannelProvider = {
  id: 'tencent-token',
  name: '鹅厂 Token',
  description: '复用 OA 登录态查询 token.woa.com 本月费用额度使用率',
  authType: 'cookie',

  async fetchUsage(
    _settings: ExtensionSettings,
    deps: ProviderDeps = {},
  ): Promise<ChannelUsageResult> {
    const fetchFn = deps.fetchFn ?? fetch;
    const base = baseResult((deps.nowMs ?? Date.now)());
    const pageQuery = deps.tencentPageQuery ?? (deps.fetchFn ? undefined :
      (createIfMissing: boolean) => runInSiteTab(TOKEN_ORIGIN, queryTencentQuotaInPage, createIfMissing));
    const unauthenticated = (): ChannelUsageResult => ({
      ...base, status: 'unauthenticated', metrics: [], errorMessage: LOGIN_MESSAGE,
    });
    const queryFromPage = async (createIfMissing: boolean): Promise<ChannelUsageResult | undefined> => {
      if (!pageQuery) return undefined;
      try {
        const response = await pageQuery(createIfMissing);
        if (!response) return undefined;
        if (response.status === 401 || response.status === 403) return unauthenticated();
        if (response.status !== 200) {
          return { ...base, status: 'error', metrics: [], errorMessage: response.error ?? `鹅厂 Token页面请求失败 (HTTP ${response.status})` };
        }
        return parseTencentTokenQuota(response.payload, base.updatedAt);
      } catch {
        return {
          ...base, status: 'error', metrics: [],
          errorMessage: '无法读取鹅厂 Token页面，请在扩展管理中允许访问 token.woa.com，重新加载扩展后刷新。',
        };
      }
    };

    const recoverSession = async (): Promise<ChannelUsageResult> =>
      await queryFromPage(true) ?? unauthenticated();

    try {
      // Fetch a fresh, session-bound page token before each quota query.
      const home = await fetchFn(TOKEN_HOME_URL, {
        credentials: 'include',
        cache: 'no-store',
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
      });
      if (isUnauthenticated(home)) return recoverSession();
      if (!home.ok) throw new Error(`鹅厂 Token首页请求失败 (HTTP ${home.status})`);
      const pageToken = extractTencentPageToken(await home.text());
      if (!pageToken) return recoverSession();

      const response = await fetchFn(TOKEN_QUOTA_URL, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        redirect: 'manual',
        headers: { accept: 'application/json', 'X-Page-Token': pageToken },
        signal: AbortSignal.timeout(15_000),
      });
      if (isUnauthenticated(response)) return recoverSession();
      if (!response.ok) throw new Error(`鹅厂 Token配额请求失败 (HTTP ${response.status})`);
      if (response.headers.get('content-type')?.includes('text/html')) return recoverSession();
      return parseTencentTokenQuota(await response.json(), base.updatedAt);
    } catch (error) {
      const recovered = await queryFromPage(true);
      if (recovered) return recovered;
      return {
        ...base,
        status: 'error',
        metrics: [],
        errorMessage: error instanceof Error ? error.message : '鹅厂 Token网络请求异常',
      };
    }
  },
};
