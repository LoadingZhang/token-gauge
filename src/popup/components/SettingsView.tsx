import {
  CheckCircle2,
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  Save,
} from 'lucide-react';
import { useState } from 'react';
import {
  ChannelId,
  ChannelUsageResult,
  DEFAULT_CHANNEL_ORDER,
  ExtensionSettings,
  TencentProductType,
} from '../../types/usage';

interface SettingsViewProps {
  settings: ExtensionSettings;
  onSave: (next: ExtensionSettings) => Promise<void>;
  onTestTencent: (
    secretId: string,
    secretKey: string,
    region: string,
    productTypes: TencentProductType[],
  ) => Promise<ChannelUsageResult>;
  onCancel: () => void;
}

const TENCENT_REGIONS: Array<{ id: string; label: string }> = [
  { id: 'ap-guangzhou', label: 'ap-guangzhou（华南地区 · 广州）' },
  { id: 'ap-beijing', label: 'ap-beijing（华北地区 · 北京）' },
  { id: 'ap-shanghai', label: 'ap-shanghai（华东地区 · 上海）' },
  { id: 'ap-singapore', label: 'ap-singapore（东南亚 · 新加坡）' },
];

const CHANNEL_META_MAP: Record<ChannelId, { id: ChannelId; name: string; desc: string }> = {
  antigravity: {
    id: 'antigravity',
    name: 'Antigravity',
    desc: '自动复用 Cookie 并同步参数',
  },
  'gemini-web': {
    id: 'gemini-web',
    name: 'Gemini Web',
    desc: '自动复用 Cookie 并同步参数',
  },
  'tencent-tokenhub': {
    id: 'tencent-tokenhub',
    name: '腾讯云 TokenHub',
    desc: '需配置 SecretId / SecretKey',
  },
  'tencent-token': {
    id: 'tencent-token',
    name: '鹅厂 Token',
    desc: '复用 OA 登录态，查看本月费用使用率',
  },
};

const PRODUCT_OPTIONS: Array<{ id: TencentProductType; label: string }> = [
  { id: 'personal', label: 'personal（TokenPlan 个人版）' },
  { id: 'personal-hunyuan', label: 'personal-hunyuan（个人版混元）' },
];

export function SettingsView({
  settings,
  onSave,
  onTestTencent,
  onCancel,
}: SettingsViewProps) {
  const [draft, setDraft] = useState<ExtensionSettings>(() => {
    const cloned = structuredClone(settings);
    if (!cloned.channelOrder || cloned.channelOrder.length === 0) {
      cloned.channelOrder = [...DEFAULT_CHANNEL_ORDER];
    }
    return cloned;
  });
  const [draggingId, setDraggingId] = useState<ChannelId | null>(null);
  const [dragOverId, setDragOverId] = useState<ChannelId | null>(null);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testNotice, setTestNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const reorderChannels = (sourceId: ChannelId, targetId: ChannelId) => {
    if (sourceId === targetId) return;
    setDraft((prev) => {
      const current = [...prev.channelOrder];
      const fromIndex = current.indexOf(sourceId);
      const toIndex = current.indexOf(targetId);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const [moved] = current.splice(fromIndex, 1);
      current.splice(toIndex, 0, moved);
      return {
        ...prev,
        channelOrder: current,
      };
    });
  };

  const toggleChannel = (id: ChannelId) => {
    setDraft((prev) => ({
      ...prev,
      enabledChannels: {
        ...prev.enabledChannels,
        [id]: !prev.enabledChannels[id],
      },
    }));
  };

  const toggleProductType = (pt: TencentProductType) => {
    setDraft((prev) => {
      const exists = prev.tencentTokenHub.productTypes.includes(pt);
      const nextTypes = exists
        ? prev.tencentTokenHub.productTypes.filter((item) => item !== pt)
        : [...prev.tencentTokenHub.productTypes, pt];
      return {
        ...prev,
        tencentTokenHub: {
          ...prev.tencentTokenHub,
          productTypes: nextTypes,
        },
      };
    });
  };

  const handleTest = async () => {
    setTesting(true);
    setTestNotice(null);
    try {
      const res = await onTestTencent(
        draft.tencentTokenHub.secretId,
        draft.tencentTokenHub.secretKey,
        draft.tencentTokenHub.region,
        draft.tencentTokenHub.productTypes,
      );
      if (res.status === 'ok') {
        const summary = res.metrics
          .map((m) => `${m.label}: ${m.usedDisplay}/${m.totalDisplay} (${m.statusBadge ?? 'OK'})`)
          .join('；');
        setTestNotice({ ok: true, text: `连接成功：${summary}` });
      } else {
        setTestNotice({ ok: false, text: res.errorMessage ?? '连接测试失败' });
      }
    } catch (err) {
      setTestNotice({
        ok: false,
        text: err instanceof Error ? err.message : '测试请求失败',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-xs">
      <div className="grid grid-cols-2 gap-3 items-start">
        <section className="rounded-xl border border-slate-200/80 bg-white p-3.5 space-y-2.5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              监控渠道与展示顺序
            </h3>
            <span className="text-[10px] text-slate-400">拖拽调整顺序</span>
          </div>
          <div className="space-y-2">
            {draft.channelOrder.map((channelId) => {
              const ch = CHANNEL_META_MAP[channelId];
              if (!ch) return null;
              const isDragging = draggingId === ch.id;
              const isDragOver = dragOverId === ch.id && draggingId !== ch.id;

              return (
                <div
                  key={ch.id}
                  draggable
                  onDragStart={(e) => {
                    setDraggingId(ch.id);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', ch.id);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverId !== ch.id) {
                      setDragOverId(ch.id);
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverId === ch.id) {
                      setDragOverId(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const sourceId =
                      (e.dataTransfer.getData('text/plain') as ChannelId) || draggingId;
                    if (sourceId) {
                      reorderChannels(sourceId, ch.id);
                    }
                    setDraggingId(null);
                    setDragOverId(null);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDragOverId(null);
                  }}
                  className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 transition-all select-none cursor-grab active:cursor-grabbing ${
                    isDragging
                      ? 'opacity-45 bg-slate-100 dark:bg-slate-800'
                      : isDragOver
                        ? 'bg-indigo-50/80 ring-2 ring-indigo-500/70 dark:bg-indigo-950/40 dark:ring-indigo-400/70'
                        : 'bg-slate-50 hover:bg-slate-100/80 dark:bg-slate-800/50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <GripVertical className="h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {ch.name}
                      </div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                        {ch.desc}
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={draft.enabledChannels[ch.id]}
                    onChange={() => toggleChannel(ch.id)}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="h-4 w-4 shrink-0 accent-indigo-600 rounded cursor-pointer"
                  />
                </div>
              );
            })}
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
            Google 渠道登录态及客户端版本参数会在您正常浏览对应页面时自动同步，无需手工维护。
          </p>
          <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
            鹅厂 Token请先在当前浏览器访问 token.woa.com 完成 OA 登录，即可查询本月已用费用占额度的百分比。
          </p>
        </section>

        <section className="rounded-xl border border-slate-200/80 bg-white p-3.5 space-y-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              腾讯云 TokenHub 配置
            </h3>
            <span className="text-[10px] text-slate-400">仅保存于本地浏览器</span>
          </div>

          <div className="space-y-2">
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                SecretId
              </span>
              <input
                type="text"
                value={draft.tencentTokenHub.secretId}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    tencentTokenHub: { ...prev.tencentTokenHub, secretId: e.target.value },
                  }))
                }
                placeholder="例如 AKID..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                SecretKey
              </span>
              <div className="relative">
                <input
                  type={showSecretKey ? 'text' : 'password'}
                  value={draft.tencentTokenHub.secretKey}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      tencentTokenHub: { ...prev.tencentTokenHub, secretKey: e.target.value },
                    }))
                  }
                  placeholder="输入 SecretKey"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 pr-8 text-xs text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => setShowSecretKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  {showSecretKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                地域 (Region)
              </span>
              <select
                value={draft.tencentTokenHub.region || 'ap-guangzhou'}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    tencentTokenHub: { ...prev.tencentTokenHub, region: e.target.value },
                  }))
                }
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {TENCENT_REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-1.5">
            <span className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
              查询套餐类型 (ProductType)
            </span>
            <div className="space-y-1.5">
              {PRODUCT_OPTIONS.map((opt) => (
                <label
                  key={opt.id}
                  className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={draft.tencentTokenHub.productTypes.includes(opt.id)}
                    onChange={() => toggleProductType(opt.id)}
                    className="h-3.5 w-3.5 accent-teal-600 rounded cursor-pointer"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" />}
              测试连接
            </button>
          </div>

          {testNotice && (
            <div
              className={`rounded-lg px-2.5 py-2 text-[11px] leading-snug ${
                testNotice.ok
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
              }`}
            >
              {testNotice.text}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-slate-200/80 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <div>
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              开发者选项
            </span>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
              开启后，在渠道卡片中显示「查看原始响应」折叠栏。
            </p>
          </div>
          <input
            type="checkbox"
            aria-label="开发者选项"
            checked={draft.developerMode}
            onChange={(e) => setDraft((prev) => ({ ...prev, developerMode: e.target.checked }))}
            className="h-4 w-4 shrink-0 accent-indigo-600 rounded cursor-pointer"
          />
        </label>
      </section>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          保存并刷新
        </button>
      </div>
    </form>
  );
}
