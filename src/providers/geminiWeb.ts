import { ChannelUsageResult, ExtensionSettings, QuotaMetric } from '../types/usage';
import { clampPercent, formatPercent } from '../utils/format';
import { ChannelProvider, ProviderDeps } from './types';

const GEMINI_BASE_URL =
  'https://gemini.google.com/_/BardChatUi/graphql/schemas/GEMINI_WEB_GRAPHQL/executeQuery';
const GEMINI_ORIGIN = 'https://gemini.google.com';
const GEMINI_USAGE_URL = `${GEMINI_ORIGIN}/usage`;

const GEMINI_VARIABLES = JSON.stringify({
  g1Request: {
    entrypoints: [
      'GEMINI_USAGE_SETTINGS_UPGRADE_BANNER',
      'GEMINI_USAGE_SETTINGS_AI_CREDITS_UPSELL_CARD',
      'GEMINI_USAGE_SETTINGS_UPGRADE_AND_CREDITS_BANNER',
    ],
  },
  workspaceRequest: {
    recommendationsForSurfaceRequests: [
      {
        recommendationSurface: {
          rpOnramp: 'GEMINI_CHAT_USAGE_LIMITS_UPSELL',
          version: '1',
        },
        maxRecommendationCount: 1,
      },
    ],
  },
});

interface GeminiPool {
  poolType?: string;
  percentageUsed?: number;
  gxu?: {
    windowRefreshesAt?: string;
  };
}

interface GeminiUsageInfo {
  subscriptionTier?: string;
  pools?: GeminiPool[];
}

export function stripGoogleXssiPrefix(text: string): string {
  const trimmed = text.trimStart();
  if (trimmed.startsWith(")]}'")) {
    const newlineIdx = trimmed.indexOf('\n');
    return newlineIdx >= 0 ? trimmed.slice(newlineIdx + 1) : trimmed.slice(4);
  }
  return text;
}

function poolSortRank(poolType: string): number {
  if (poolType === 'GXU_FIVE_HOURLY') return 0;
  if (poolType === 'GXU_WEEKLY') return 1;
  return 2;
}

function mapPoolLabel(poolType: string): string {
  if (poolType === 'GXU_FIVE_HOURLY') return '5 小时窗口';
  if (poolType === 'GXU_WEEKLY') return '周窗口';
  return poolType || '配额池';
}

function findUsageInfo(payload: unknown): GeminiUsageInfo | undefined {
  const chunks = Array.isArray(payload) ? payload : [payload];
  for (const chunk of chunks) {
    if (!chunk || typeof chunk !== 'object') continue;
    const data = (chunk as Record<string, unknown>).data;
    if (!data || typeof data !== 'object') continue;
    const viewer = (data as Record<string, unknown>).viewer;
    if (!viewer || typeof viewer !== 'object') continue;
    const rpcs = (viewer as Record<string, unknown>).rpcs;
    if (!rpcs || typeof rpcs !== 'object') continue;
    const getUsageInfo = (rpcs as Record<string, unknown>).getUsageInfo;
    if (getUsageInfo && typeof getUsageInfo === 'object') {
      return getUsageInfo as GeminiUsageInfo;
    }
  }
  return undefined;
}

// The usage page embeds the same GraphQL data for its initial render.
// Decode only JSON preload chunks; never execute scripts from the page.
export function extractGeminiUsageFromHtml(html: string): unknown | undefined {
  const chunksById = new Map<string, string>();
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (!/\bdata-bg3-relay-preload(?:\s|=|$)/i.test(match[1]) ||
        !/\btype\s*=\s*(["'])application\/json\1/i.test(match[1])) continue;
    try {
      const preload = JSON.parse(match[2]) as { events?: Array<{ id?: string; kind?: string; chunk?: unknown }> };
      if (!Array.isArray(preload?.events)) continue;
      for (const event of preload.events) {
        if (event?.kind !== 'chunk' || typeof event.chunk !== 'string') continue;
        const id = event.id ?? '';
        const combined = (chunksById.get(id) ?? '') + event.chunk;
        chunksById.set(id, combined);
        try {
          const payload: unknown = JSON.parse(combined);
          if (findUsageInfo(payload)) return payload;
        } catch {
          // Other preload events may contain incomplete or unrelated chunks.
        }
      }
    } catch {
      // Ignore malformed preloads and continue looking for the usage data.
    }
  }
  return undefined;
}

/**
 * Parses Gemini Web's deferred GraphQL response array.
 */
export function parseGeminiWebQuota(
  payload: unknown,
  updatedAt = Date.now(),
): ChannelUsageResult {
  const baseResult: Omit<ChannelUsageResult, 'status' | 'metrics'> = {
    channelId: 'gemini-web',
    channelName: 'Gemini Web',
    loginUrl: GEMINI_ORIGIN,
    updatedAt,
    rawPayload: payload,
  };

  const usageInfo = findUsageInfo(payload);
  if (!usageInfo || !Array.isArray(usageInfo.pools)) {
    return {
      ...baseResult,
      status: 'unauthenticated',
      metrics: [],
      errorMessage: '未获取到 Gemini Web 用量信息，请确认已在 Edge 登录 gemini.google.com。',
    };
  }

  const sortedPools = [...usageInfo.pools].sort(
    (a, b) => poolSortRank(a.poolType ?? '') - poolSortRank(b.poolType ?? ''),
  );

  const metrics: QuotaMetric[] = [];
  for (const pool of sortedPools) {
    if (typeof pool.percentageUsed !== 'number') continue;
    const usedPercent = clampPercent(pool.percentageUsed * 100);
    const remainingPercent = clampPercent(100 - usedPercent);
    const poolType = pool.poolType ?? `pool-${metrics.length}`;

    metrics.push({
      id: poolType,
      label: mapPoolLabel(poolType),
      usedPercent,
      usedDisplay: formatPercent(usedPercent),
      remainingDisplay: formatPercent(remainingPercent),
      resetAt: pool.gxu?.windowRefreshesAt,
    });
  }

  if (metrics.length === 0) {
    return {
      ...baseResult,
      tierBadge: usageInfo.subscriptionTier,
      status: 'error',
      metrics: [],
      errorMessage: 'Gemini Web 返回的配额池为空',
    };
  }

  return {
    ...baseResult,
    tierBadge: usageInfo.subscriptionTier,
    status: 'ok',
    metrics,
  };
}

export function buildGeminiRequestUrl(querySignature: string): string {
  const url = new URL(GEMINI_BASE_URL);
  url.searchParams.set('query_signature', querySignature);
  url.searchParams.set('variables', GEMINI_VARIABLES);
  return url.toString();
}

export const geminiWebProvider: ChannelProvider = {
  id: 'gemini-web',
  name: 'Gemini Web',
  description: '通过浏览器 Google Cookie 读取 Gemini 用量页面',
  authType: 'cookie',

  async fetchUsage(
    settings: ExtensionSettings,
    deps: ProviderDeps = {},
  ): Promise<ChannelUsageResult> {
    const fetchFn = deps.fetchFn ?? fetch;
    const now = (deps.nowMs ?? Date.now)();

    const baseResult = {
      channelId: 'gemini-web', channelName: 'Gemini Web', metrics: [],
      loginUrl: GEMINI_ORIGIN, updatedAt: now,
    };

    let pageError = '无法从 Gemini 页面读取用量信息，请确认已在当前浏览器登录 Gemini 后重试。';
    try {
      const page = await fetchFn(GEMINI_USAGE_URL, {
        credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(15_000),
      });
      if (page.status === 401 || page.status === 403 || page.url?.includes('accounts.google.com')) {
        return {
          ...baseResult, status: 'unauthenticated',
          errorMessage: 'Gemini Web 未登录或会话已过期，请先在当前浏览器打开 gemini.google.com 登录。',
        };
      }
      if (page.ok) {
        const payload = extractGeminiUsageFromHtml(await page.text());
        if (payload !== undefined) return parseGeminiWebQuota(payload, now);
      } else {
        pageError = `Gemini 用量页面请求失败 (${page.status})，请稍后刷新重试。`;
      }
    } catch (error) {
      pageError = error instanceof Error ? `Gemini 用量页面请求失败：${error.message}` : pageError;
    }

    // Retain captured GraphQL parameters as a fallback for page format changes.
    if (!settings.geminiWeb.querySignature || !settings.geminiWeb.extHeaderBin) {
      return { ...baseResult, status: 'error', errorMessage: pageError };
    }

    const url = buildGeminiRequestUrl(settings.geminiWeb.querySignature);

    try {
      const response = await fetchFn(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'x-goog-ext-525001261-bin': settings.geminiWeb.extHeaderBin,
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (
        response.status === 401 ||
        response.status === 403 ||
        response.url?.includes('accounts.google.com')
      ) {
        return {
          channelId: 'gemini-web',
          channelName: 'Gemini Web',
          status: 'unauthenticated',
          metrics: [],
          loginUrl: GEMINI_ORIGIN,
          errorMessage: 'Gemini Web 未登录或会话已过期，请先在 Edge 打开 gemini.google.com 登录。',
          updatedAt: now,
        };
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return {
          channelId: 'gemini-web',
          channelName: 'Gemini Web',
          status: 'error',
          metrics: [],
          loginUrl: GEMINI_ORIGIN,
          errorMessage: `请求失败 (${response.status})${text ? `: ${text.slice(0, 120)}` : ''}`,
          updatedAt: now,
        };
      }

      const rawText = await response.text();
      const cleaned = stripGoogleXssiPrefix(rawText);
      const payload: unknown = JSON.parse(cleaned);
      return parseGeminiWebQuota(payload, now);
    } catch (error) {
      return {
        channelId: 'gemini-web',
        channelName: 'Gemini Web',
        status: 'error',
        metrics: [],
        loginUrl: GEMINI_ORIGIN,
        errorMessage: error instanceof Error ? error.message : '网络或 JSON 解析异常',
        updatedAt: now,
      };
    }
  },
};
