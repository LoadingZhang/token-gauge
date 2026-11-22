import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  KeyRound,
  RefreshCw,
  Settings,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { ChannelId, ChannelUsageResult, QuotaMetric } from '../../types/usage';
import { formatAbsoluteTime } from '../../utils/format';
import { QuotaBar } from './QuotaBar';

interface ChannelCardProps {
  result: ChannelUsageResult;
  developerMode: boolean;
  refreshing: boolean;
  onRefresh: (channelId: ChannelId) => void;
  onOpenSettings: () => void;
}

interface MetricGroup {
  groupName?: string;
  items: QuotaMetric[];
}

function groupMetrics(metrics: QuotaMetric[]): MetricGroup[] {
  const groups: MetricGroup[] = [];
  const indexMap = new Map<string, number>();

  for (const m of metrics) {
    const key = m.groupName ?? '__ungrouped__';
    const existingIdx = indexMap.get(key);
    if (existingIdx !== undefined) {
      groups[existingIdx].items.push(m);
    } else {
      indexMap.set(key, groups.length);
      groups.push({
        groupName: m.groupName,
        items: [m],
      });
    }
  }
  return groups;
}

const CHANNEL_ACCENTS: Record<string, string> = {
  antigravity: 'bg-indigo-500',
  'gemini-web': 'bg-sky-500',
  'tencent-tokenhub': 'bg-teal-500',
  'tencent-token': 'bg-orange-500',
};

export function ChannelCard({
  result,
  developerMode,
  refreshing,
  onRefresh,
  onOpenSettings,
}: ChannelCardProps) {
  const [showRaw, setShowRaw] = useState(false);
  const groups = useMemo(() => groupMetrics(result.metrics), [result.metrics]);
  const accent = CHANNEL_ACCENTS[result.channelId] ?? 'bg-slate-500';

  const statusDot =
    result.status === 'ok'
      ? 'bg-emerald-500'
      : result.status === 'unauthenticated' || result.status === 'unconfigured'
        ? 'bg-amber-500'
        : 'bg-rose-500';

  const handleOpenLogin = () => {
    if (result.loginUrl) {
      chrome.tabs.create({ url: result.loginUrl });
    }
  };

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-4 w-1 rounded-full ${accent}`} />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            {result.channelName}
          </h2>
          {result.tierBadge && (
            <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
              {result.tierBadge}
            </span>
          )}
          <span className={`h-2 w-2 rounded-full ${statusDot}`} title={result.status} />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {result.updatedAt > 0 && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              {formatAbsoluteTime(result.updatedAt)}
            </span>
          )}
          <button
            type="button"
            onClick={() => onRefresh(result.channelId as ChannelId)}
            disabled={refreshing}
            title="刷新该渠道"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {result.status === 'ok' && result.metrics.length > 0 && (
        <div className="mt-2.5 space-y-2">
          {groups.map((group, idx) => (
            <div
              key={group.groupName ?? idx}
              className={
                group.groupName
                  ? 'rounded-lg bg-slate-50/80 p-2 space-y-2 dark:bg-slate-800/40'
                  : 'space-y-2'
              }
            >
              {group.groupName && (
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {group.groupName}
                </div>
              )}

              <div className="space-y-2">
                {group.items.map((metric) => (
                  <QuotaBar key={metric.id} metric={metric} />
                ))}
              </div>
            </div>
          ))}

          {result.errorMessage && (
            <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{result.errorMessage}</span>
            </div>
          )}
        </div>
      )}

      {result.status !== 'ok' && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800/50">
          <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
            <p className="leading-relaxed whitespace-pre-line">
              {result.errorMessage || '暂无可用数据'}
            </p>
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            {result.status === 'unauthenticated' && result.loginUrl && (
              <button
                type="button"
                onClick={handleOpenLogin}
                className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 cursor-pointer"
              >
                <ExternalLink className="h-3 w-3" />
                前往登录
              </button>
            )}
            {result.status === 'unconfigured' && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex items-center gap-1 rounded-md bg-teal-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-teal-700 cursor-pointer"
              >
                <KeyRound className="h-3 w-3" />
                去设置 AK/SK
              </button>
            )}
            {result.status === 'error' && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
              >
                <Settings className="h-3 w-3" />
                检查配置
              </button>
            )}
          </div>
        </div>
      )}

      {developerMode && result.rawPayload !== undefined && (
        <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => setShowRaw((prev) => !prev)}
            className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
          >
            {showRaw ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showRaw ? '收起原始响应' : '查看原始响应'}
          </button>
          {showRaw && (
            <pre className="mt-1.5 max-h-40 overflow-auto rounded-md bg-slate-900 p-2 text-[10px] leading-relaxed text-slate-200">
              {JSON.stringify(result.rawPayload, null, 2)}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}
