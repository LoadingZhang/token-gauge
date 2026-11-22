import { afterEach, expect, it, vi } from 'vitest';
import { ensureHeaderRules } from '../src/background/dnr';

afterEach(() => vi.unstubAllGlobals());

it('limits the Tencent fetch metadata rule to the extension quota API and preserves authentication headers', async () => {
  const updateDynamicRules = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('chrome', {
    runtime: { id: 'test-extension-id' },
    declarativeNetRequest: { updateDynamicRules },
  });
  await ensureHeaderRules();
  const { removeRuleIds, addRules } = updateDynamicRules.mock.calls[0][0];
  const rule = addRules.find((item: chrome.declarativeNetRequest.Rule) => item.id === 1003);
  expect(removeRuleIds).toContain(1003);
  expect(rule.condition.initiatorDomains).toEqual(['test-extension-id']);
  expect(rule.action.requestHeaders).toEqual([{ header: 'Sec-Fetch-Site', operation: 'remove' }]);
  const pattern = new RegExp(rule.condition.regexFilter);
  expect(pattern.test('https://token.woa.com/api/query-quota?platform=all')).toBe(true);
  expect(pattern.test('https://token.woa.com/api/user')).toBe(false);
  expect(pattern.test('https://token.woa.com/')).toBe(false);
  expect(pattern.test('https://token.woa.com.evil.example/api/query-quota?platform=all')).toBe(false);
});
