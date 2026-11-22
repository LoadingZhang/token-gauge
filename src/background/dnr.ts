const RULE_ANTIGRAVITY_ORIGIN = 1001;
const RULE_GEMINI_REFERER = 1002;
const RULE_TENCENT_FETCH_METADATA = 1003;

export async function ensureHeaderRules(): Promise<void> {
  if (!chrome.declarativeNetRequest) return;

  const extensionId = chrome.runtime.id;
  const rules: chrome.declarativeNetRequest.Rule[] = [
    {
      id: RULE_ANTIGRAVITY_ORIGIN,
      priority: 1,
      action: {
        type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
        requestHeaders: [
          {
            header: 'Origin',
            operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
            value: 'https://antigravity.google.com',
          },
        ],
      },
      condition: {
        urlFilter: '||aicode.clients6.google.com/$rpc/',
        resourceTypes: ['xmlhttprequest' as chrome.declarativeNetRequest.ResourceType],
        initiatorDomains: [extensionId],
      },
    },
    {
      id: RULE_GEMINI_REFERER,
      priority: 1,
      action: {
        type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
        requestHeaders: [
          {
            header: 'Referer',
            operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
            value: 'https://gemini.google.com/',
          },
        ],
      },
      condition: {
        urlFilter: '||gemini.google.com/_/BardChatUi/graphql/',
        resourceTypes: ['xmlhttprequest' as chrome.declarativeNetRequest.ResourceType],
        initiatorDomains: [extensionId],
      },
    },
    {
      id: RULE_TENCENT_FETCH_METADATA,
      priority: 1,
      action: {
        type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
        requestHeaders: [{
          header: 'Sec-Fetch-Site',
          operation: 'remove' as chrome.declarativeNetRequest.HeaderOperation,
        }],
      },
      condition: {
        // This API rejects extension fetch metadata "none" even with a valid session
        // and page token. Omit it only on this extension's exact quota query.
        regexFilter: '^https://token\\.woa\\.com/api/query-quota\\?platform=all$',
        resourceTypes: ['xmlhttprequest' as chrome.declarativeNetRequest.ResourceType],
        initiatorDomains: [extensionId],
      },
    },
  ];

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [RULE_ANTIGRAVITY_ORIGIN, RULE_GEMINI_REFERER, RULE_TENCENT_FETCH_METADATA],
    addRules: rules,
  });
}
