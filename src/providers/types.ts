import { ChannelId, ChannelUsageResult, ExtensionSettings } from '../types/usage';

export interface CookieReader {
  getCookie(url: string, name: string): Promise<string | undefined>;
}

export interface ProviderDeps {
  fetchFn?: typeof fetch;
  cookieReader?: CookieReader;
  nowMs?: () => number;
  tencentPageQuery?: (createIfMissing: boolean) => Promise<{
    status: number;
    payload?: unknown;
    error?: string;
  } | undefined>;
}

export interface ChannelProvider {
  readonly id: ChannelId;
  readonly name: string;
  readonly description: string;
  readonly authType: 'cookie' | 'api-key';
  fetchUsage(
    settings: ExtensionSettings,
    deps?: ProviderDeps,
  ): Promise<ChannelUsageResult>;
}

export const defaultCookieReader: CookieReader = {
  async getCookie(url: string, name: string): Promise<string | undefined> {
    if (typeof chrome === 'undefined' || !chrome.cookies) return undefined;
    const cookie = await chrome.cookies.get({ url, name });
    return cookie?.value;
  },
};
