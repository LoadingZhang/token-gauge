import { describe, expect, it } from 'vitest';
import { ChannelUsageResult } from '../src/types/usage';
import { distributeToTwoColumns } from '../src/utils/layout';

const antigravityTall: ChannelUsageResult = {
  channelId: 'antigravity',
  channelName: 'Antigravity',
  status: 'ok',
  updatedAt: 1,
  metrics: [
    { id: 'g-5h', groupName: 'Gemini Models', label: '5 小时窗口', usedPercent: 3 },
    { id: 'g-wk', groupName: 'Gemini Models', label: '周窗口', usedPercent: 2 },
    { id: 'c-5h', groupName: 'Claude and GPT models', label: '5 小时窗口', usedPercent: 0 },
    { id: 'c-wk', groupName: 'Claude and GPT models', label: '周窗口', usedPercent: 0 },
    { id: 'a-wk', groupName: 'Gemini 4 Argon', label: '周窗口', usedPercent: 2 },
  ],
};

const geminiShort: ChannelUsageResult = {
  channelId: 'gemini-web',
  channelName: 'Gemini Web',
  status: 'ok',
  updatedAt: 1,
  metrics: [
    { id: '5h', label: '5 小时窗口', usedPercent: 6 },
    { id: 'wk', label: '周窗口', usedPercent: 4 },
  ],
};

const tencentShort: ChannelUsageResult = {
  channelId: 'tencent-tokenhub',
  channelName: '腾讯云 TokenHub',
  status: 'ok',
  updatedAt: 1,
  metrics: [
    {
      id: 'personal',
      label: 'TokenPlan 个人版',
      usedPercent: 5,
      usedDisplay: '38.84',
      totalDisplay: '780',
      subLabel: 'Token: 输入 1.98M / 输出 427K',
    },
  ],
};

describe('distributeToTwoColumns', () => {
  it('places both shorter cards in the right column alongside a tall Antigravity card', () => {
    const [left, right] = distributeToTwoColumns([
      antigravityTall,
      geminiShort,
      tencentShort,
    ]);

    expect(left.map((c) => c.channelId)).toEqual(['antigravity']);
    expect(right.map((c) => c.channelId)).toEqual(['gemini-web', 'tencent-tokenhub']);
  });

  it('balances 4 equal-height cards evenly across both columns', () => {
    const [left, right] = distributeToTwoColumns([
      { ...geminiShort, channelId: 'c1' },
      { ...geminiShort, channelId: 'c2' },
      { ...geminiShort, channelId: 'c3' },
      { ...geminiShort, channelId: 'c4' },
    ]);

    expect(left.map((c) => c.channelId)).toEqual(['c1', 'c3']);
    expect(right.map((c) => c.channelId)).toEqual(['c2', 'c4']);
  });
});
