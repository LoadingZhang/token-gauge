import { loadSettings, saveSettings } from '../utils/storage';

const GEMINI_GRAPHQL_PATTERN =
  'https://gemini.google.com/_/BardChatUi/graphql/schemas/GEMINI_WEB_GRAPHQL/executeQuery*';
const ANTIGRAVITY_RPC_PATTERN = 'https://aicode.clients6.google.com/$rpc/*';

export interface CapturedPatch {
  antigravity?: {
    authUser?: string;
    apiKey?: string;
  };
  geminiWeb?: {
    querySignature?: string;
    extHeaderBin?: string;
  };
}

export interface WebRequestLikeDetails {
  url: string;
  tabId: number;
  initiator?: string;
  requestHeaders?: Array<{ name: string; value?: string }>;
}

function getHeaderValue(
  headers: Array<{ name: string; value?: string }> | undefined,
  targetName: string,
): string | undefined {
  if (!headers) return undefined;
  const lower = targetName.toLowerCase();
  for (const h of headers) {
    if (h.name.toLowerCase() === lower && h.value) {
      return h.value;
    }
  }
  return undefined;
}

export function extractCapturedPatch(
  details: WebRequestLikeDetails,
): CapturedPatch | null {
  // Ignore background/extension-originated requests so we only sync from real browser tabs.
  if (details.tabId < 0 || details.initiator?.startsWith('chrome-extension://')) {
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(details.url);
  } catch {
    return null;
  }

  if (parsedUrl.hostname === 'gemini.google.com') {
    const extHeaderBin = getHeaderValue(details.requestHeaders, 'x-goog-ext-525001261-bin');
    const variables = parsedUrl.searchParams.get('variables') ?? '';
    const isUsageQuery =
      variables.includes('GEMINI_USAGE_SETTINGS') ||
      variables.includes('GEMINI_CHAT_USAGE_LIMITS_UPSELL');
    const querySignature = isUsageQuery
      ? parsedUrl.searchParams.get('query_signature') ?? undefined
      : undefined;

    if (!extHeaderBin && !querySignature) return null;
    return {
      geminiWeb: {
        ...(querySignature ? { querySignature } : {}),
        ...(extHeaderBin ? { extHeaderBin } : {}),
      },
    };
  }

  if (parsedUrl.hostname === 'aicode.clients6.google.com' &&
      parsedUrl.pathname.startsWith('/$rpc/') &&
      (!details.initiator || details.initiator === 'https://antigravity.google.com')) {
    const authUser = getHeaderValue(details.requestHeaders, 'x-goog-authuser') ??
      parsedUrl.searchParams.get('authuser') ?? undefined;
    const apiKey = getHeaderValue(details.requestHeaders, 'x-goog-api-key') ??
      parsedUrl.searchParams.get('key') ?? undefined;

    if (!authUser && !apiKey) return null;
    return {
      antigravity: {
        ...(authUser ? { authUser } : {}),
        ...(apiKey ? { apiKey } : {}),
      },
    };
  }

  return null;
}

let writeQueue: Promise<void> = Promise.resolve();

function applyPatchToStorage(patch: CapturedPatch): void {
  writeQueue = writeQueue
    .then(async () => {
      const current = await loadSettings();
      let changed = false;

      if (patch.antigravity) {
        if (
          patch.antigravity.authUser &&
          patch.antigravity.authUser !== current.antigravity.authUser
        ) {
          current.antigravity.authUser = patch.antigravity.authUser;
          changed = true;
        }
        if (
          patch.antigravity.apiKey &&
          patch.antigravity.apiKey !== current.antigravity.apiKey
        ) {
          current.antigravity.apiKey = patch.antigravity.apiKey;
          changed = true;
        }
      }

      if (patch.geminiWeb) {
        if (
          patch.geminiWeb.querySignature &&
          patch.geminiWeb.querySignature !== current.geminiWeb.querySignature
        ) {
          current.geminiWeb.querySignature = patch.geminiWeb.querySignature;
          changed = true;
        }
        if (
          patch.geminiWeb.extHeaderBin &&
          patch.geminiWeb.extHeaderBin !== current.geminiWeb.extHeaderBin
        ) {
          current.geminiWeb.extHeaderBin = patch.geminiWeb.extHeaderBin;
          changed = true;
        }
      }

      if (changed) {
        await saveSettings(current);
      }
    })
    .catch(() => {
      // Passive sync should never interrupt normal requests.
    });
}

/**
 * Registers read-only MV3 webRequest listeners at Service Worker startup
 * to passively keep Google client headers and signatures up to date.
 */
export function registerAutoCaptureListeners(): void {
  if (typeof chrome === 'undefined' || !chrome.webRequest?.onSendHeaders) return;

  chrome.webRequest.onSendHeaders.addListener(
    (details) => {
      const patch = extractCapturedPatch(details);
      if (patch) {
        applyPatchToStorage(patch);
      }
    },
    {
      urls: [GEMINI_GRAPHQL_PATTERN, ANTIGRAVITY_RPC_PATTERN],
    },
    ['requestHeaders'],
  );
}
