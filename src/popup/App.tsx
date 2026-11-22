import { Activity, ArrowLeft, RefreshCw, Settings } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { sortResultsByChannelOrder } from '../providers/registry';
import {
  ChannelId,
  ChannelUsageResult,
  DEFAULT_SETTINGS,
  ExtensionSettings,
  RuntimeRequest,
  RuntimeResponse,
  TencentProductType,
} from '../types/usage';
import { formatPercent } from '../utils/format';
import { distributeToTwoColumns } from '../utils/layout';
import { ChannelCard } from './components/ChannelCard';
import { SettingsView } from './components/SettingsView';

function sendRuntimeMessage<T>(msg: RuntimeRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response: RuntimeResponse<T>) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error('后台服务无响应'));
        return;
      }
      if (!response.ok) {
        reject(new Error(response.error));
        return;
      }
      resolve(response.data);
    });
  });
}

export default function App() {
  const [view, setView] = useState<'dashboard' | 'settings'>('dashboard');
  const [results, setResults] = useState<ChannelUsageResult[]>([]);
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [loadingAll, setLoadingAll] = useState(false);
  const [loadingChannel, setLoadingChannel] = useState<ChannelId | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const fetchAll = useCallback(async (forceRefresh: boolean) => {
    setLoadingAll(true);
    setGlobalError(null);
    try {
      const data = await sendRuntimeMessage<ChannelUsageResult[]>({
        type: 'GET_USAGE',
        forceRefresh,
      });
      setResults(data);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : '拉取用量失败');
    } finally {
      setLoadingAll(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [loadedSettings, cached] = await Promise.all([
          sendRuntimeMessage<ExtensionSettings>({ type: 'GET_SETTINGS' }),
          sendRuntimeMessage<ChannelUsageResult[]>({ type: 'GET_USAGE', forceRefresh: false }),
        ]);
        if (!active) return;
        setSettings(loadedSettings);
        if (cached.length > 0) {
          setResults(cached);
        }
        // Silently refresh live data right after showing cached snapshot
        await fetchAll(true);
      } catch (err) {
        if (!active) return;
        setGlobalError(err instanceof Error ? err.message : '初始化失败');
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchAll]);

  const handleRefreshSingle = async (channelId: ChannelId) => {
    setLoadingChannel(channelId);
    setGlobalError(null);
    try {
      const updated = await sendRuntimeMessage<ChannelUsageResult[]>({
        type: 'GET_USAGE',
        channelId,
        forceRefresh: true,
      });
      setResults(updated);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : '刷新渠道失败');
    } finally {
      setLoadingChannel(null);
    }
  };

  const handleSaveSettings = async (next: ExtensionSettings) => {
    const saved = await sendRuntimeMessage<ExtensionSettings>({
      type: 'SAVE_SETTINGS',
      settings: next,
    });
    setSettings(saved);
    setResults((prev) =>
      sortResultsByChannelOrder(
        prev.filter((item) => saved.enabledChannels[item.channelId as ChannelId] !== false),
        saved.channelOrder,
      ),
    );
    setView('dashboard');
    await fetchAll(true);
  };

  const handleTestTencent = (
    secretId: string,
    secretKey: string,
    region: string,
    productTypes: TencentProductType[],
  ) =>
    sendRuntimeMessage<ChannelUsageResult>({
      type: 'TEST_TENCENT_CREDENTIALS',
      secretId,
      secretKey,
      region,
      productTypes,
    });

  const orderedResults = useMemo(
    () => sortResultsByChannelOrder(results, settings.channelOrder),
    [results, settings.channelOrder],
  );

  const [leftColumn, rightColumn] = useMemo(
    () => distributeToTwoColumns(orderedResults),
    [orderedResults],
  );

  const summary = useMemo(() => {
    const activeCount = orderedResults.filter((r) => r.status === 'ok').length;
    let maxPercent = 0;
    let maxLabel = '';
    for (const ch of orderedResults) {
      for (const m of ch.metrics) {
        if (m.usedPercent >= maxPercent) {
          maxPercent = m.usedPercent;
          maxLabel = `${ch.channelName} · ${m.label}`;
        }
      }
    }
    return { activeCount, totalCount: orderedResults.length, maxPercent, maxLabel };
  }, [orderedResults]);

  return (
    <div className="flex h-full min-h-[260px] max-h-[600px] flex-col bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-cyan-500 text-white shadow-xs">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold leading-tight text-slate-900 dark:text-slate-100">
              {view === 'dashboard' ? '模型 Token 调用率' : '渠道与凭证设置'}
            </h1>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              {view === 'dashboard'
                ? `已连接 ${summary.activeCount}/${summary.totalCount} 个渠道${
                    summary.maxLabel ? ` · 峰值 ${formatPercent(summary.maxPercent)}` : ''
                  }`
                : '配置渠道开关、展示顺序与腾讯云 API 密钥'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {view === 'dashboard' ? (
            <>
              <button
                type="button"
                onClick={() => void fetchAll(true)}
                disabled={loadingAll}
                title="全部刷新"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingAll ? 'animate-spin' : ''}`} />
                刷新
              </button>
              <button
                type="button"
                onClick={() => setView('settings')}
                title="设置"
                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
              >
                <Settings className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setView('dashboard')}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              返回总览
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-3 space-y-3">
        {globalError && (
          <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
            {globalError}
          </div>
        )}

        {view === 'dashboard' ? (
          results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-slate-400">
              {loadingAll ? (
                <>
                  <RefreshCw className="h-6 w-6 animate-spin text-indigo-500 mb-2" />
                  <span>正在拉取各渠道最新配额...</span>
                </>
              ) : (
                <span>暂无已启用的监控渠道，请前往设置页开启。</span>
              )}
            </div>
          ) : orderedResults.length === 1 ? (
            <ChannelCard
              key={orderedResults[0].channelId}
              result={orderedResults[0]}
              developerMode={settings.developerMode}
              refreshing={loadingAll || loadingChannel === orderedResults[0].channelId}
              onRefresh={(id) => void handleRefreshSingle(id)}
              onOpenSettings={() => setView('settings')}
            />
          ) : (
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0 space-y-3">
                {leftColumn.map((item) => (
                  <ChannelCard
                    key={item.channelId}
                    result={item}
                    developerMode={settings.developerMode}
                    refreshing={loadingAll || loadingChannel === item.channelId}
                    onRefresh={(id) => void handleRefreshSingle(id)}
                    onOpenSettings={() => setView('settings')}
                  />
                ))}
              </div>
              <div className="flex-1 min-w-0 space-y-3">
                {rightColumn.map((item) => (
                  <ChannelCard
                    key={item.channelId}
                    result={item}
                    developerMode={settings.developerMode}
                    refreshing={loadingAll || loadingChannel === item.channelId}
                    onRefresh={(id) => void handleRefreshSingle(id)}
                    onOpenSettings={() => setView('settings')}
                  />
                ))}
              </div>
            </div>
          )
        ) : (
          <SettingsView
            settings={settings}
            onSave={handleSaveSettings}
            onTestTencent={handleTestTencent}
            onCancel={() => setView('dashboard')}
          />
        )}
      </main>
    </div>
  );
}
