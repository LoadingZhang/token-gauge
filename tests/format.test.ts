import { describe, expect, it } from 'vitest';
import { formatCompactNumber, formatCountdown, formatPercent } from '../src/utils/format';

describe('format utils', () => {
  it('formats compact numbers across K/M/B ranges and small decimals', () => {
    expect(formatCompactNumber('50000000')).toBe('50M');
    expect(formatCompactNumber('8362150')).toBe('8.36M');
    expect(formatCompactNumber(1500)).toBe('1.5K');
    expect(formatCompactNumber('38.8427159')).toBe('38.84');
    expect(formatCompactNumber('780')).toBe('780');
    expect(formatCompactNumber(0)).toBe('0');
  });

  it('formats percentages cleanly', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.04)).toBe('<0.1%');
    expect(formatPercent(6)).toBe('6%');
    expect(formatPercent(3.946)).toBe('3.9%');
    expect(formatPercent(100)).toBe('100%');
  });

  it('formats countdown relative to nowMs', () => {
    const now = Date.parse('2026-11-22T10:00:00Z');
    expect(formatCountdown('2026-11-22T12:17:00Z', now)).toBe('2小时17分后重置');
    expect(formatCountdown('2026-11-24T13:00:00Z', now)).toBe('2天3小时后重置');
    expect(formatCountdown('2026-11-22T10:00:30Z', now)).toBe('1 分钟内重置');
    expect(formatCountdown('2026-11-22T09:59:00Z', now)).toBe('已重置 / 即将刷新');
  });
});
