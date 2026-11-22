export type ChannelId = 'antigravity' | 'gemini-web' | 'tencent-tokenhub' | 'tencent-token';

export type TencentProductType = 'personal' | 'personal-hunyuan';

export interface QuotaMetric {
  id: string;
  groupName?: string;
  groupDescription?: string;
  label: string;
  usedPercent: number;
  usedDisplay?: string;
  remainingDisplay?: string;
  totalDisplay?: string;
  resetAt?: string;
  statusBadge?: string;
  subLabel?: string;
}

export type ChannelStatus = 'ok' | 'unauthenticated' | 'unconfigured' | 'error';

export interface ChannelUsageResult {
  channelId: ChannelId | string;
  channelName: string;
  tierBadge?: string;
  status: ChannelStatus;
  metrics: QuotaMetric[];
  summaryNote?: string;
  errorMessage?: string;
  loginUrl?: string;
  updatedAt: number;
  rawPayload?: unknown;
}

export interface ExtensionSettings {
  developerMode: boolean;
  enabledChannels: Record<ChannelId, boolean>;
  channelOrder: ChannelId[];
  antigravity: {
    authUser: string;
    apiKey: string;
  };
  geminiWeb: {
    querySignature: string;
    extHeaderBin: string;
  };
  tencentTokenHub: {
    secretId: string;
    secretKey: string;
    region: string;
    productTypes: TencentProductType[];
  };
}

export const DEFAULT_CHANNEL_ORDER: ChannelId[] = [
  'antigravity',
  'gemini-web',
  'tencent-tokenhub',
  'tencent-token',
];

export const DEFAULT_TENCENT_REGION = 'ap-guangzhou';

export const DEFAULT_ANTIGRAVITY_API_KEY = '';

export const DEFAULT_SETTINGS: ExtensionSettings = {
  developerMode: false,
  enabledChannels: {
    antigravity: true,
    'gemini-web': true,
    'tencent-tokenhub': true,
    'tencent-token': true,
  },
  channelOrder: [...DEFAULT_CHANNEL_ORDER],
  antigravity: {
    authUser: '0',
    apiKey: DEFAULT_ANTIGRAVITY_API_KEY,
  },
  geminiWeb: {
    querySignature: '',
    extHeaderBin: '',
  },
  tencentTokenHub: {
    secretId: '',
    secretKey: '',
    region: DEFAULT_TENCENT_REGION,
    productTypes: ['personal', 'personal-hunyuan'],
  },
};

export type RuntimeRequest =
  | { type: 'GET_USAGE'; forceRefresh?: boolean; channelId?: ChannelId }
  | { type: 'GET_SETTINGS' }
  | { type: 'SAVE_SETTINGS'; settings: ExtensionSettings }
  | {
      type: 'TEST_TENCENT_CREDENTIALS';
      secretId: string;
      secretKey: string;
      region?: string;
      productTypes: TencentProductType[];
    };

export type RuntimeResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };
