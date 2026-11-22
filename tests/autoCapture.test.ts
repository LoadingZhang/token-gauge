import { describe, expect, it } from 'vitest';
import { extractCapturedPatch } from '../src/background/autoCapture';

describe('extractCapturedPatch', () => {
  it('captures query_signature and ext header from Gemini usage GraphQL requests', () => {
    const url =
      'https://gemini.google.com/_/BardChatUi/graphql/schemas/GEMINI_WEB_GRAPHQL/executeQuery' +
      '?query_signature=NEW_SIG_123%3D&variables=' +
      encodeURIComponent(
        JSON.stringify({ g1Request: { entrypoints: ['GEMINI_USAGE_SETTINGS_UPGRADE_BANNER'] } }),
      );

    const patch = extractCapturedPatch({
      url,
      tabId: 12,
      initiator: 'https://gemini.google.com',
      requestHeaders: [{ name: 'X-Goog-Ext-525001261-Bin', value: 'NEW_BIN_HEADER' }],
    });

    expect(patch).toEqual({
      geminiWeb: {
        querySignature: 'NEW_SIG_123=',
        extHeaderBin: 'NEW_BIN_HEADER',
      },
    });
  });

  it('does not overwrite query_signature from unrelated Gemini GraphQL queries', () => {
    const url =
      'https://gemini.google.com/_/BardChatUi/graphql/schemas/GEMINI_WEB_GRAPHQL/executeQuery' +
      '?query_signature=OTHER_QUERY_SIG&variables=%7B%22chatId%22%3A%22abc%22%7D';

    const patch = extractCapturedPatch({
      url,
      tabId: 12,
      initiator: 'https://gemini.google.com',
      requestHeaders: [{ name: 'x-goog-ext-525001261-bin', value: 'FRESH_BIN' }],
    });

    expect(patch).toEqual({
      geminiWeb: {
        extHeaderBin: 'FRESH_BIN',
      },
    });
  });

  it('captures authuser and apiKey from Antigravity quota requests', () => {
    const patch = extractCapturedPatch({
      url: 'https://aicode.clients6.google.com/$rpc/google.gca.aicode.v1alpha.JetskiRemoteAgentProxyService/GetUserQuotaSummary',
      tabId: 8,
      initiator: 'https://antigravity.google.com',
      requestHeaders: [
        { name: 'x-goog-authuser', value: '1' },
        { name: 'x-goog-api-key', value: 'NEW_KEY' },
      ],
    });

    expect(patch).toEqual({
      antigravity: {
        authUser: '1',
        apiKey: 'NEW_KEY',
      },
    });
  });

  it('ignores requests initiated by the extension itself', () => {
    const patch = extractCapturedPatch({
      url: 'https://aicode.clients6.google.com/$rpc/google.gca.aicode.v1alpha.JetskiRemoteAgentProxyService/GetUserQuotaSummary',
      tabId: -1,
      initiator: 'chrome-extension://abcdefghijklmnop',
      requestHeaders: [{ name: 'x-goog-authuser', value: '2' }],
    });

    expect(patch).toBeNull();
  });

  it('captures keys from non-quota Antigravity RPCs and query parameters', () => {
    expect(extractCapturedPatch({
      url: 'https://aicode.clients6.google.com/$rpc/google.gca.aicode.v1alpha.JetskiRemoteAgentProxyService/ListProjects?key=CLIENT_KEY&authuser=1',
      tabId: 8, initiator: 'https://antigravity.google.com',
    })).toEqual({ antigravity: { apiKey: 'CLIENT_KEY', authUser: '1' } });
  });

  it('does not capture client keys belonging to other Google products', () => {
    expect(extractCapturedPatch({
      url: 'https://aicode.clients6.google.com/$rpc/OtherProduct?key=OTHER_KEY',
      tabId: 8, initiator: 'https://other.google.com',
    })).toBeNull();
  });
});
