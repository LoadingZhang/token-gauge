export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function formatPercent(value: number): string {
  const clamped = clampPercent(value);
  if (clamped > 0 && clamped < 0.1) return '<0.1%';
  if (clamped >= 99.95) return `${Math.round(clamped)}%`;
  const rounded = Math.round(clamped * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

/**
 * Formats large credit/token strings or numbers into compact human-readable form (e.g., 50M, 8.36M).
 */
export function formatCompactNumber(raw: string | number | undefined): string {
  if (raw === undefined || raw === null || raw === '') return '-';
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) return String(raw);
  if (num === 0) return '0';

  const abs = Math.abs(num);
  const units: Array<{ threshold: number; suffix: string }> = [
    { threshold: 1e12, suffix: 'T' },
    { threshold: 1e9, suffix: 'B' },
    { threshold: 1e6, suffix: 'M' },
    { threshold: 1e3, suffix: 'K' },
  ];

  for (const { threshold, suffix } of units) {
    if (abs >= threshold) {
      const scaled = num / threshold;
      const formatted =
        Math.abs(scaled) >= 100
          ? scaled.toFixed(0)
          : Math.abs(scaled) >= 10
            ? scaled.toFixed(1)
            : scaled.toFixed(2);
      return `${formatted.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')}${suffix}`;
    }
  }
  if (Number.isInteger(num)) {
    return String(num);
  }
  return num.toFixed(2).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

/**
 * Parses an integer string/number safely into a non-negative finite number.
 */
export function parseSafeNumber(raw: string | number | undefined): number {
  if (raw === undefined || raw === null || raw === '') return 0;
  const num = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Formats a future ISO timestamp into a concise Chinese countdown string.
 */
export function formatCountdown(
  resetAt: string | undefined,
  nowMs = Date.now(),
): string | undefined {
  if (!resetAt) return undefined;
  const targetMs = Date.parse(resetAt);
  if (!Number.isFinite(targetMs)) return undefined;

  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) return '已重置 / 即将刷新';

  const totalMinutes = Math.floor(diffMs / 60_000);
  if (totalMinutes < 1) return '1 分钟内重置';

  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `${days}天${hours}小时后重置` : `${days}天后重置`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}小时${minutes}分后重置` : `${hours}小时后重置`;
  }
  return `${minutes}分钟后重置`;
}

export function formatAbsoluteTime(isoOrMs: string | number | undefined): string {
  if (!isoOrMs) return '';
  const date = new Date(isoOrMs);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export type UsageSeverity = 'normal' | 'warning' | 'danger';

export function getUsageSeverity(usedPercent: number): UsageSeverity {
  if (usedPercent >= 85) return 'danger';
  if (usedPercent >= 60) return 'warning';
  return 'normal';
}
