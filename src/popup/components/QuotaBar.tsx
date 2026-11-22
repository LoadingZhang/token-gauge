import { Clock } from 'lucide-react';
import { QuotaMetric } from '../../types/usage';
import {
  clampPercent,
  formatAbsoluteTime,
  formatCountdown,
  formatPercent,
  getUsageSeverity,
} from '../../utils/format';

interface QuotaBarProps {
  metric: QuotaMetric;
}

const BAR_COLORS = {
  normal: 'bg-emerald-500 dark:bg-emerald-400',
  warning: 'bg-amber-500 dark:bg-amber-400',
  danger: 'bg-rose-500 dark:bg-rose-400',
};

const TEXT_COLORS = {
  normal: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-rose-600 dark:text-rose-400',
};

export function QuotaBar({ metric }: QuotaBarProps) {
  const pct = clampPercent(metric.usedPercent);
  const severity = getUsageSeverity(pct);
  const countdown = formatCountdown(metric.resetAt);
  const absReset = formatAbsoluteTime(metric.resetAt);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="font-medium text-slate-700 dark:text-slate-200 truncate">
            {metric.label}
          </span>
          {metric.statusBadge && (
            <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {metric.statusBadge}
            </span>
          )}
          {countdown && (
            <span
              title={absReset ? `重置时间：${absReset}` : undefined}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700 ring-1 ring-inset ring-sky-200/70 dark:bg-sky-950/60 dark:text-sky-300 dark:ring-sky-800/60"
            >
              <Clock className="h-2.5 w-2.5 opacity-80" />
              {countdown}
            </span>
          )}
        </div>
        <span className={`shrink-0 font-semibold tabular-nums ${TEXT_COLORS[severity]}`}>
          {formatPercent(pct)}
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-300 ${BAR_COLORS[severity]}`}
          style={{ width: `${Math.max(pct > 0 ? 2 : 0, pct)}%` }}
        />
      </div>

      {metric.totalDisplay && (
        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
          已用 <strong className="font-medium text-slate-700 dark:text-slate-200">{metric.usedDisplay}</strong>
          {' / '}
          {metric.totalDisplay}
          {metric.remainingDisplay && ` (余 ${metric.remainingDisplay})`}
        </div>
      )}

      {metric.subLabel && (
        <p className="text-[11px] leading-snug text-slate-400 dark:text-slate-500">
          {metric.subLabel}
        </p>
      )}
    </div>
  );
}
