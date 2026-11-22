import {
  ChannelUsageResult,
  DEFAULT_TENCENT_REGION,
  ExtensionSettings,
  QuotaMetric,
  TencentProductType,
} from '../types/usage';
import { signTencentCloudV3 } from '../utils/crypto';
import {
  clampPercent,
  formatCompactNumber,
  parseSafeNumber,
} from '../utils/format';
import { ChannelProvider, ProviderDeps } from './types';

const TENCENT_HOST = 'tokenhub.tencentcloudapi.com';
const TENCENT_SERVICE = 'tokenhub';
const TENCENT_ACTION = 'DescribeTokenPlanPersonalPackage';
const TENCENT_VERSION = '2026-03-22';

const PRODUCT_TYPE_LABELS: Record<TencentProductType, string> = {
  personal: 'TokenPlan 个人版',
  'personal-hunyuan': 'TokenPlan 个人版 · 混元',
};

const PACKAGE_STATUS_LABELS: Record<string, string> = {
  active: '生效中',
  processing: '处理中',
  failed: '创建失败',
  isolated: '隔离/欠费',
  destroyed: '已销毁',
  used_up: '额度用尽',
  stopped: '已停止',
  unpurchased: '未购买',
};

export interface TencentPackageResponse {
  Response?: {
    ProductType?: string;
    PackageStatus?: string;
    PkgId?: string;
    ResourceId?: string;
    TotalCredits?: string | number;
    TotalUsed?: string | number;
    CycleCredits?: string | number;
    TotalCycles?: number;
    CurrentCycle?: number;
    RemainCycles?: number;
    StartTime?: string;
    ExpireTime?: string;
    PeriodEndDate?: string;
    AutoRenewFlag?: number;
    InputToken?: number;
    OutputToken?: number;
    CacheToken?: number;
    RequestId?: string;
    Error?: {
      Code?: string;
      Message?: string;
    };
  };
}

/**
 * Normalizes Tencent Cloud timestamps such as:
 * - "2026-12-08 13:15:28" (UTC+8)
 * - "2026-12-08" (date-only, UTC+8 end of day)
 * - ISO 8601 "2026-07-15T00:00:00Z"
 */
export function normalizeTencentTimestamp(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed.replace(' ', 'T')}+08:00`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T23:59:59+08:00`;
  }
  return trimmed;
}

function resolveResetTime(periodEndDate?: string, expireTime?: string): string | undefined {
  // If ExpireTime falls on the exact same calendar date as bare PeriodEndDate, prefer the exact time.
  if (
    periodEndDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(periodEndDate.trim()) &&
    expireTime &&
    expireTime.trim().startsWith(periodEndDate.trim())
  ) {
    return normalizeTencentTimestamp(expireTime);
  }
  return normalizeTencentTimestamp(periodEndDate || expireTime);
}

export function parseTencentPackageMetric(
  productType: TencentProductType,
  body: TencentPackageResponse,
): { metric?: QuotaMetric; error?: string } {
  const resp = body.Response;
  if (!resp) {
    return { error: `${PRODUCT_TYPE_LABELS[productType]}: 响应缺少 Response 字段` };
  }
  if (resp.Error) {
    return {
      error: `${PRODUCT_TYPE_LABELS[productType]}: [${resp.Error.Code ?? 'Error'}] ${resp.Error.Message ?? '接口调用失败'}`,
    };
  }

  const label = PRODUCT_TYPE_LABELS[productType] ?? productType;
  const normalizedStatus = (resp.PackageStatus ?? '').trim().toLowerCase();
  const statusBadge =
    PACKAGE_STATUS_LABELS[normalizedStatus] || resp.PackageStatus || undefined;

  if (normalizedStatus === 'unpurchased') {
    return {
      metric: {
        id: `tencent-${productType}`,
        label,
        usedPercent: 0,
        usedDisplay: '0',
        remainingDisplay: '0',
        totalDisplay: '0',
        statusBadge,
        subLabel: '当前账号尚未购买该套餐',
      },
    };
  }

  const total = parseSafeNumber(resp.TotalCredits);
  const used = parseSafeNumber(resp.TotalUsed);
  const remaining = Math.max(0, total - used);
  const usedPercent = total > 0 ? clampPercent((used / total) * 100) : 0;

  return {
    metric: {
      id: `tencent-${productType}`,
      label,
      usedPercent,
      usedDisplay: formatCompactNumber(used),
      remainingDisplay: formatCompactNumber(remaining),
      totalDisplay: formatCompactNumber(total),
      resetAt: resolveResetTime(resp.PeriodEndDate, resp.ExpireTime),
      statusBadge,
    },
  };
}

export async function querySingleTencentProduct(
  secretId: string,
  secretKey: string,
  region: string,
  productType: TencentProductType,
  fetchFn: typeof fetch,
  nowMs: number,
): Promise<{
  productType: TencentProductType;
  metric?: QuotaMetric;
  error?: string;
  raw?: unknown;
}> {
  const payload = JSON.stringify({ ProductType: productType });
  const headers = await signTencentCloudV3({
    secretId,
    secretKey,
    host: TENCENT_HOST,
    service: TENCENT_SERVICE,
    action: TENCENT_ACTION,
    version: TENCENT_VERSION,
    region: region.trim() || DEFAULT_TENCENT_REGION,
    payload,
    timestampSec: Math.floor(nowMs / 1000),
  });

  const response = await fetchFn(`https://${TENCENT_HOST}/`, {
    method: 'POST',
    headers,
    body: payload,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return {
      productType,
      error: `${PRODUCT_TYPE_LABELS[productType]}: HTTP ${response.status}${text ? ` - ${text.slice(0, 120)}` : ''}`,
    };
  }

  const json = (await response.json()) as TencentPackageResponse;
  const parsed = parseTencentPackageMetric(productType, json);
  return {
    productType,
    metric: parsed.metric,
    error: parsed.error,
    raw: json,
  };
}

export const tencentTokenHubProvider: ChannelProvider = {
  id: 'tencent-tokenhub',
  name: '腾讯云 TokenHub',
  description: '使用 SecretId / SecretKey 查询 TokenPlan 个人版套餐用量',
  authType: 'api-key',

  async fetchUsage(
    settings: ExtensionSettings,
    deps: ProviderDeps = {},
  ): Promise<ChannelUsageResult> {
    const fetchFn = deps.fetchFn ?? fetch;
    const now = (deps.nowMs ?? Date.now)();
    const { secretId, secretKey, region, productTypes } = settings.tencentTokenHub;

    if (!secretId.trim() || !secretKey.trim()) {
      return {
        channelId: 'tencent-tokenhub',
        channelName: '腾讯云 TokenHub',
        status: 'unconfigured',
        metrics: [],
        errorMessage: '尚未配置腾讯云 SecretId / SecretKey，请前往设置页填写。',
        updatedAt: now,
      };
    }

    if (!productTypes || productTypes.length === 0) {
      return {
        channelId: 'tencent-tokenhub',
        channelName: '腾讯云 TokenHub',
        status: 'unconfigured',
        metrics: [],
        errorMessage: '未勾选要查询的 ProductType，请在设置页至少勾选一项。',
        updatedAt: now,
      };
    }

    const effectiveRegion = region?.trim() || DEFAULT_TENCENT_REGION;

    try {
      const results = await Promise.all(
        productTypes.map((pt) =>
          querySingleTencentProduct(
            secretId.trim(),
            secretKey.trim(),
            effectiveRegion,
            pt,
            fetchFn,
            now,
          ),
        ),
      );

      const metrics: QuotaMetric[] = [];
      const errors: string[] = [];
      const rawMap: Record<string, unknown> = {};

      for (const item of results) {
        if (item.raw !== undefined) rawMap[item.productType] = item.raw;
        if (item.metric) metrics.push(item.metric);
        if (item.error) errors.push(item.error);
      }

      if (metrics.length === 0 && errors.length > 0) {
        return {
          channelId: 'tencent-tokenhub',
          channelName: '腾讯云 TokenHub',
          status: 'error',
          metrics: [],
          errorMessage: errors.join('\n'),
          updatedAt: now,
          rawPayload: rawMap,
        };
      }

      return {
        channelId: 'tencent-tokenhub',
        channelName: '腾讯云 TokenHub',
        status: 'ok',
        metrics,
        errorMessage: errors.length > 0 ? errors.join('；') : undefined,
        updatedAt: now,
        rawPayload: rawMap,
      };
    } catch (error) {
      return {
        channelId: 'tencent-tokenhub',
        channelName: '腾讯云 TokenHub',
        status: 'error',
        metrics: [],
        errorMessage: error instanceof Error ? error.message : '网络请求异常',
        updatedAt: now,
      };
    }
  },
};
