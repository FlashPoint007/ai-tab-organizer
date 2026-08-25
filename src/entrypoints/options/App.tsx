import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { browser } from 'wxt/browser';

import { sendRequest } from '@/lib/messaging/client';
import type { LlmConfigPayload, LlmUsageStats } from '@/lib/messaging/protocol';
import { buildBackupFileName, parseBackupText } from '@/lib/settings/backup';
import type { AutoOrganizeConfig, DomainRule, UiLanguage } from '@/lib/settings/types';
import { findPreset, LLM_PRESETS, originFromBaseUrl } from '@/lib/llm/presets';

type RuleMatchType = DomainRule['matchType'];

const btn =
  'rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300 transition hover:border-neutral-600 hover:text-white disabled:opacity-40 disabled:hover:border-neutral-800 disabled:hover:text-neutral-300';
const input =
  'rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-sm outline-none placeholder:text-neutral-600 focus:border-emerald-700';

interface LlmFormState {
  preset: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: string;
}

export default function App() {
  const [rules, setRules] = useState<DomainRule[] | null>(null);
  const [categories, setCategories] = useState<string[] | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [draft, setDraft] = useState<{ pattern: string; matchType: RuleMatchType; category: string }>({
    pattern: '',
    matchType: 'domain',
    category: '',
  });
  const [error, setError] = useState<string | null>(null);

  // M4：自动化与界面
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>('zh');
  const [autoApplyState, setAutoApplyState] = useState(false);
  const [realtimeState, setRealtimeState] = useState(true);
  const [minGroupSize, setMinGroupSize] = useState(2);
  const [autoOrganize, setAutoOrganize] = useState<AutoOrganizeConfig>({
    mode: 'off',
    intervalMinutes: 30,
    thresholdCount: 8,
  });

  // M3：AI 模型配置
  const [llm, setLlm] = useState<LlmFormState | null>(null);
  const [usage, setUsage] = useState<LlmUsageStats | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const fail = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [r, c, u, cfg, ui] = await Promise.all([
          sendRequest<DomainRule[]>({ type: 'listRules' }),
          sendRequest<string[]>({ type: 'listCategories' }),
          sendRequest<LlmUsageStats>({ type: 'getLlmUsage' }),
          sendRequest<LlmConfigPayload | null>({ type: 'getLlmConfig' }),
          sendRequest<{
            language: UiLanguage;
            autoApply: boolean;
            realtime: boolean;
            minGroupSizeForRules: number;
            autoOrganize: AutoOrganizeConfig;
          }>({ type: 'getUiSettings' }),
        ]);
        setRules(r);
        setCategories(c);
        setUsage(u);
        setUiLanguage(ui.language);
        setAutoApplyState(ui.autoApply);
        setRealtimeState(ui.realtime);
        setMinGroupSize(ui.minGroupSizeForRules);
        setAutoOrganize(ui.autoOrganize);
        setLlm(
          cfg
            ? {
                preset: cfg.preset,
                baseUrl: cfg.baseUrl,
                model: cfg.model,
                apiKey: cfg.apiKey ?? '',
                temperature: cfg.temperature !== undefined ? String(cfg.temperature) : '',
              }
            : { preset: 'deepseek', baseUrl: '', model: '', apiKey: '', temperature: '' },
        );
      } catch (e) {
        fail(e);
      }
    })();
  }, [fail]);

  const saveRules = useCallback(
    async (next: DomainRule[]) => {
      setRules(next); // 乐观更新
      try {
        await sendRequest({ type: 'saveRules', rules: next });
      } catch (e) {
        fail(e);
      }
    },
    [fail],
  );

  const saveCategories = useCallback(
    async (next: string[]) => {
      setCategories(next);
      try {
        await sendRequest({ type: 'saveCategories', categories: next });
      } catch (e) {
        fail(e);
      }
    },
    [fail],
  );

  const saveUi = useCallback(
    async (patch: {
      language?: UiLanguage;
      autoApply?: boolean;
      realtime?: boolean;
      minGroupSizeForRules?: number;
      autoOrganize?: AutoOrganizeConfig;
    }) => {
      try {
        await sendRequest({ type: 'saveUiSettings', ...patch });
      } catch (e) {
        fail(e);
      }
    },
    [fail],
  );

  // ---- 备份与恢复 ----
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [exportIncludeKey, setExportIncludeKey] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const handleExport = useCallback((): void => {
    void (async () => {
      try {
        const bundle = await sendRequest<{
          rules: DomainRule[];
          categories: string[];
          minGroupSizeForRules: number;
          autoApply: boolean;
          autoOrganize: AutoOrganizeConfig;
          language: UiLanguage;
          realtime: boolean;
          llm: LlmConfigPayload | null;
        }>({ type: 'getExportBundle' });

        const backup = {
          version: 1 as const,
          exportedAt: new Date().toISOString(),
          settings: {
            rules: bundle.rules,
            categories: bundle.categories,
            minGroupSizeForRules: bundle.minGroupSizeForRules,
            autoApply: bundle.autoApply,
            autoOrganize: bundle.autoOrganize,
            language: bundle.language,
            realtime: bundle.realtime,
            llm: bundle.llm
              ? {
                  preset: bundle.llm.preset,
                  baseUrl: bundle.llm.baseUrl,
                  model: bundle.llm.model,
                  ...(exportIncludeKey && bundle.llm.apiKey ? { apiKey: bundle.llm.apiKey } : {}),
                  ...(bundle.llm.temperature !== undefined
                    ? { temperature: bundle.llm.temperature }
                    : {}),
                }
              : null,
          },
        };

        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = buildBackupFileName();
        anchor.click();
        URL.revokeObjectURL(url);
        setImportMsg('已导出 ' + anchor.download);
      } catch (e) {
        fail(e);
      }
    })();
  }, [exportIncludeKey, fail]);

  const handleImport = useCallback(
    (file: File): void => {
      void (async () => {
        try {
          const backup = parseBackupText(await file.text());
          const s = backup.settings;
          await sendRequest({ type: 'saveRules', rules: s.rules });
          if (s.categories.length > 0) {
            await sendRequest({ type: 'saveCategories', categories: s.categories });
          }
          await sendRequest({
            type: 'saveUiSettings',
            ...(s.language !== undefined ? { language: s.language } : {}),
            ...(s.autoApply !== undefined ? { autoApply: s.autoApply } : {}),
            ...(s.realtime !== undefined ? { realtime: s.realtime } : {}),
            ...(s.autoOrganize !== undefined ? { autoOrganize: s.autoOrganize } : {}),
          });
          if (s.llm) {
            await sendRequest({ type: 'saveLlmConfig', config: s.llm });
          }
          // 刷新本地视图状态
          const [r, c, u, cfg] = await Promise.all([
            sendRequest<DomainRule[]>({ type: 'listRules' }),
            sendRequest<string[]>({ type: 'listCategories' }),
            sendRequest<LlmUsageStats>({ type: 'getLlmUsage' }),
            sendRequest<LlmConfigPayload | null>({ type: 'getLlmConfig' }),
          ]);
          setRules(r);
          setCategories(c);
          setUsage(u);
          if (cfg) {
            setLlm({
              preset: cfg.preset,
              baseUrl: cfg.baseUrl,
              model: cfg.model,
              apiKey: cfg.apiKey ?? '',
              temperature: cfg.temperature !== undefined ? String(cfg.temperature) : '',
            });
          }
          setImportMsg('导入成功：' + s.rules.length + ' 条规则，' + s.categories.length + ' 个分类');
        } catch (e) {
          fail(e);
        }
      })();
    },
    [fail],
  );

  const usageCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const rule of rules ?? []) {
      counts.set(rule.category, (counts.get(rule.category) ?? 0) + 1);
    }
    return counts;
  }, [rules]);

  function addCategory(): void {
    const name = newCategory.trim();
    if (!name) return;
    if ((categories ?? []).includes(name)) {
      setError('分类已存在');
      return;
    }
    setNewCategory('');
    void saveCategories([...(categories ?? []), name]);
  }

  function removeCategory(name: string): void {
    const used = usageCount.get(name) ?? 0;
    if (used > 0) {
      setError('「' + name + '」被 ' + used + ' 条规则引用，请先修改或删除这些规则');
      return;
    }
    void saveCategories((categories ?? []).filter((c) => c !== name));
  }

  function addRule(): void {
    const pattern = draft.pattern.trim();
    const category = draft.category.trim();
    if (!pattern || !category) {
      setError('规则内容和类别都不能为空');
      return;
    }
    const rule: DomainRule = {
      id: crypto.randomUUID(),
      matchType: draft.matchType,
      pattern,
      category,
      enabled: true,
    };
    setDraft({ pattern: '', matchType: draft.matchType, category });
    void saveRules([...(rules ?? []), rule]);
  }

  function moveRule(index: number, delta: -1 | 1): void {
    if (!rules) return;
    const target = index + delta;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    void saveRules(next);
  }

  // ---------- AI 模型配置 ----------
  async function ensureOriginPermission(baseUrl: string): Promise<boolean> {
    const origin = originFromBaseUrl(baseUrl);
    if (!origin) {
      setError('baseUrl 必须是合法的 http(s) 地址');
      return false;
    }
    const already = await browser.permissions.contains({ origins: [origin] });
    if (already) return true;
    // 必须在用户手势里调用（按钮回调内），浏览器会弹出授权确认
    return browser.permissions.request({ origins: [origin] });
  }

  function buildPayload(): LlmConfigPayload | null {
    if (!llm) return null;
    const baseUrl = llm.baseUrl.trim();
    const model = llm.model.trim();
    if (!baseUrl || !model) {
      setError('baseUrl 和模型名都不能为空');
      return null;
    }
    try {
      const u = new URL(baseUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad protocol');
    } catch {
      setError('baseUrl 必须是合法的 http(s) 地址');
      return null;
    }
    const tempRaw = llm.temperature.trim();
    return {
      preset: llm.preset,
      baseUrl,
      model,
      ...(llm.apiKey.trim() ? { apiKey: llm.apiKey.trim() } : {}),
      ...(tempRaw ? { temperature: Number(tempRaw) } : {}),
    };
  }

  async function handleSaveLlm(): Promise<void> {
    const payload = buildPayload();
    if (!payload) return;
    if (!(await ensureOriginPermission(payload.baseUrl))) {
      if (!error) setError('未授予该域名的访问权限，插件将无法调用该服务');
      return;
    }
    try {
      await sendRequest({ type: 'saveLlmConfig', config: payload });
      setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
      setError(null);
    } catch (e) {
      fail(e);
    }
  }

  async function handleTestLlm(): Promise<void> {
    const payload = buildPayload();
    if (!payload) return;
    if (!(await ensureOriginPermission(payload.baseUrl))) {
      setTestResult({ ok: false, text: '未授予该域名的访问权限' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const r = await sendRequest<{ ok: boolean; latencyMs: number; error?: string }>({
        type: 'testLlmConnection',
        config: payload,
      });
      setTestResult(
        r.ok
          ? { ok: true, text: '连接成功，耗时 ' + r.latencyMs + 'ms' }
          : { ok: false, text: r.error ?? '连接失败' },
      );
    } catch (e) {
      setTestResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  }

  function applyPreset(presetId: string): void {
    const preset = findPreset(presetId);
    setLlm((prev) =>
      prev
        ? {
            ...prev,
            preset: presetId,
            baseUrl: preset?.baseUrl ?? prev.baseUrl,
            model: preset?.defaultModel ?? '',
          }
        : prev,
    );
    setTestResult(null);
  }

  const activePreset = findPreset(llm?.preset ?? '');
  const showApiKey = activePreset?.needsApiKey ?? true;

  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-neutral-950 p-6 pb-16 text-neutral-100">
      <h1 className="text-xl font-semibold tracking-tight">AI Tab Organizer · 设置</h1>
      <p className="mt-1 text-sm text-neutral-400">
        M3：AI 自动分类已接入。规则引擎（M2）继续作为离线兜底。
      </p>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          <span className="flex-1">{error}</span>
          <button type="button" className="text-red-400 hover:text-red-200" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}

      {/* AI 模型配置 */}
      <section className="mt-6">
        <h2 className="text-base font-semibold">AI 模型</h2>
        <p className="mt-1 text-xs leading-relaxed text-neutral-500">
          任意 OpenAI 兼容端点均可（含本机 Ollama / LM Studio）。保存时会按域名请求访问授权，
          API Key 只保存在本地浏览器中，不会上传。
        </p>

        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <label className="w-20 shrink-0 text-xs text-neutral-500">服务商</label>
            <select
              value={llm?.preset ?? 'deepseek'}
              onChange={(e) => applyPreset(e.target.value)}
              className={input + ' w-52'}
            >
              {LLM_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="w-20 shrink-0 text-xs text-neutral-500">Base URL</label>
            <input
              value={llm?.baseUrl ?? ''}
              onChange={(e) => setLlm((prev) => (prev ? { ...prev, baseUrl: e.target.value } : prev))}
              placeholder="https://api.deepseek.com/v1"
              className={input + ' min-w-0 flex-1'}
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="w-20 shrink-0 text-xs text-neutral-500">模型</label>
            <input
              value={llm?.model ?? ''}
              onChange={(e) => setLlm((prev) => (prev ? { ...prev, model: e.target.value } : prev))}
              placeholder="deepseek-chat"
              className={input + ' min-w-0 flex-1'}
            />
            {!showApiKey && <span className="shrink-0 text-[11px] text-neutral-600">本地服务无需 Key</span>}
          </div>

          {showApiKey && (
            <div className="flex items-center gap-2">
              <label className="w-20 shrink-0 text-xs text-neutral-500">API Key</label>
              <input
                type="password"
                value={llm?.apiKey ?? ''}
                onChange={(e) => setLlm((prev) => (prev ? { ...prev, apiKey: e.target.value } : prev))}
                placeholder="sk-…（仅存本地）"
                className={input + ' min-w-0 flex-1'}
              />
              <input
                value={llm?.temperature ?? ''}
                onChange={(e) => setLlm((prev) => (prev ? { ...prev, temperature: e.target.value } : prev))}
                placeholder="温度 0"
                className={input + ' w-24'}
              />
            </div>
          )}

          {activePreset?.hint && <p className="pl-[5.5rem] text-[11px] text-neutral-500">💡 {activePreset.hint}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
              onClick={() => void handleSaveLlm()}
            >
              授权并保存
            </button>
            <button type="button" className={btn} disabled={testing} onClick={() => void handleTestLlm()}>
              {testing ? '测试中…' : '测试连接'}
            </button>
            {testResult && (
              <span className={'text-xs ' + (testResult.ok ? 'text-emerald-400' : 'text-red-400')}>
                {testResult.text}
              </span>
            )}
            {!testResult && savedAt && <span className="text-xs text-emerald-400">已保存于 {savedAt}</span>}
          </div>

          <div className="pt-1">
            <button
              type="button"
              className="text-[11px] text-neutral-500 underline decoration-dotted hover:text-amber-400"
              title="分类结果有缓存：改了分类策略或想让 AI 重新细分时，先清缓存再整理"
              onClick={() => {
                void (async () => {
                  try {
                    await sendRequest({ type: 'clearCategoryCache' });
                    setError(null);
                  } catch (e) {
                    fail(e);
                  }
                })();
              }}
            >
              清空 AI 分类缓存（下次整理将全部重新分类）
            </button>
          </div>

          {usage && (
            <p className="pt-1 text-[11px] text-neutral-500">
              用量统计：请求 {usage.requests} 次 · 累计 {usage.totalTokens} tokens · 降级批次{' '}
              {usage.degradedBatches}
              <button
                type="button"
                className="ml-2 underline decoration-dotted hover:text-neutral-300"
                onClick={() => {
                  void (async () => {
                    try {
                      await sendRequest({ type: 'clearLlmUsage' });
                      setUsage({ requests: 0, totalTokens: 0, degradedBatches: 0 });
                    } catch (e) {
                      fail(e);
                    }
                  })();
                }}
              >
                清零
              </button>
            </p>
          )}
        </div>
      </section>

      {/* 自动整理与界面 */}
      <section className="mt-8">
        <h2 className="text-base font-semibold">自动整理与界面</h2>

        <div className="mt-3 flex items-center gap-2">
          <label className="w-24 shrink-0 text-xs text-neutral-500">界面语言 / Language</label>
          <select
            value={uiLanguage}
            onChange={(e) => {
              const language = e.target.value as UiLanguage;
              setUiLanguage(language);
              void saveUi({ language });
            }}
            className={input + ' w-32'}
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <label className="w-24 shrink-0 text-xs text-neutral-500">AI 整理确认</label>
          <label className="flex items-center gap-1.5 text-xs text-neutral-300">
            <input
              type="checkbox"
              className="accent-emerald-600"
              checked={autoApplyState}
              onChange={(e) => {
                const autoApply = e.target.checked;
                setAutoApplyState(autoApply);
                void saveUi({ autoApply });
              }}
            />
            直接生效，跳过预览确认
          </label>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <label className="w-24 shrink-0 text-xs text-neutral-500">实时归类</label>
          <label className="flex items-center gap-1.5 text-xs text-neutral-300">
            <input
              type="checkbox"
              className="accent-emerald-600"
              checked={realtimeState}
              onChange={(e) => {
                const realtime = e.target.checked;
                setRealtimeState(realtime);
                void saveUi({ realtime });
              }}
            />
            新标签打开后自动归类入组（缓存/规则优先，必要时单条 AI 请求）
          </label>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <label className="w-24 shrink-0 text-xs text-neutral-500">成组门槛</label>
          <input
            type="number"
            min={2}
            max={50}
            value={minGroupSize}
            onChange={(e) => {
              const minGroupSizeForRules = Math.max(2, Number(e.target.value) || 2);
              setMinGroupSize(minGroupSizeForRules);
              void saveUi({ minGroupSizeForRules });
            }}
            className={input + ' w-28'}
          />
          <span className="text-[11px] text-neutral-600">
            同类别标签数达到该值才建 Chrome 标签组（2 = 单标签不建组，避免标签栏拥挤）
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <label className="w-24 shrink-0 text-xs text-neutral-500">自动触发</label>
          <select
            value={autoOrganize.mode}
            onChange={(e) => {
              const mode = e.target.value as AutoOrganizeConfig['mode'];
              const next = { ...autoOrganize, mode };
              setAutoOrganize(next);
              void saveUi({ autoOrganize: next });
            }}
            className={input + ' w-56'}
          >
            <option value="off">关闭（仅手动/快捷键）</option>
            <option value="interval">定时整理</option>
            <option value="threshold">未分组达到阈值</option>
          </select>
          {autoOrganize.mode === 'interval' && (
            <input
              type="number"
              min={5}
              max={1440}
              value={autoOrganize.intervalMinutes}
              onChange={(e) => {
                const intervalMinutes = Math.max(5, Number(e.target.value) || 30);
                const next = { ...autoOrganize, intervalMinutes };
                setAutoOrganize(next);
                void saveUi({ autoOrganize: next });
              }}
              className={input + ' w-28'}
            />
          )}
          {autoOrganize.mode === 'threshold' && (
            <input
              type="number"
              min={2}
              max={200}
              value={autoOrganize.thresholdCount}
              onChange={(e) => {
                const thresholdCount = Math.max(2, Number(e.target.value) || 8);
                const next = { ...autoOrganize, thresholdCount };
                setAutoOrganize(next);
                void saveUi({ autoOrganize: next });
              }}
              className={input + ' w-28'}
            />
          )}
        </div>
        <p className="mt-2 pl-[6.5rem] text-[11px] text-neutral-600">
          快捷键 Alt+Shift+O 随时可用（chrome://extensions/shortcuts 可改键）；自动触发仅在已配置 AI 模型时生效。
        </p>
      </section>

      {/* 分类管理 */}
      <section className="mt-8">
        <h2 className="text-base font-semibold">分类管理</h2>
        <p className="mt-1 text-xs text-neutral-500">
          这份类别清单同时约束规则引擎与 AI 分类输出；AI 对没把握的标签会跳过并回落到规则。
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(categories ?? []).map((name) => {
            const used = usageCount.get(name) ?? 0;
            return (
              <span
                key={name}
                title={used > 0 ? '被 ' + used + ' 条规则引用，不能删除' : '点击 × 删除'}
                className="flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900 py-1 pl-3 pr-1.5 text-xs"
              >
                {name}
                {used > 0 && <span className="text-[10px] text-neutral-500">×{used}</span>}
                <button
                  type="button"
                  disabled={used > 0}
                  onClick={() => removeCategory(name)}
                  className="rounded-full px-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addCategory();
            }}
            placeholder="新增分类名称"
            className={input + ' w-56'}
          />
          <button type="button" className={btn} onClick={addCategory}>
            添加分类
          </button>
        </div>
      </section>

      {/* 规则编辑器 */}
      <section className="mt-8">
        <h2 className="text-base font-semibold">分组规则</h2>
        <p className="mt-1 text-xs leading-relaxed text-neutral-500">
          从上到下依次匹配，先命中先生效（可用 ↑↓ 调整优先级）。
          域名规则匹配主域及其全部子域；关键词规则匹配标题或网址的子串。
          「按类别分组」与 AI 整理的兜底都使用这里的规则。
        </p>

        <ul className="mt-3 space-y-2">
          {(rules ?? []).map((rule, i) => (
            <li
              key={rule.id}
              className={
                'flex items-center gap-2 rounded-lg border p-2.5 ' +
                (rule.enabled
                  ? 'border-neutral-800 bg-neutral-900'
                  : 'border-neutral-800/60 bg-neutral-900/40 opacity-60')
              }
            >
              <input
                type="checkbox"
                className="accent-emerald-600"
                checked={rule.enabled}
                title={rule.enabled ? '点击禁用' : '点击启用'}
                onChange={() =>
                  void saveRules((rules ?? []).map((rr) => (rr.id === rule.id ? { ...rr, enabled: !rr.enabled } : rr)))
                }
              />
              <span className="w-14 shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-center text-[10px] text-neutral-400">
                {rule.matchType === 'domain' ? '域名' : '关键词'}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-neutral-200" title={rule.pattern}>
                {rule.pattern}
              </span>
              <span className="shrink-0 text-xs text-neutral-500">→</span>
              <select
                value={rule.category}
                onChange={(e) => {
                  const category = e.target.value;
                  if (!category) return;
                  void saveRules((rules ?? []).map((rr) => (rr.id === rule.id ? { ...rr, category } : rr)));
                }}
                className="w-28 shrink-0 rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-xs outline-none focus:border-emerald-700"
              >
                {[...new Set([rule.category, ...(categories ?? [])])].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  className={btn + ' !px-1.5'}
                  disabled={i === 0}
                  onClick={() => moveRule(i, -1)}
                  title="上移（提高优先级）"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={btn + ' !px-1.5'}
                  disabled={!rules || i >= rules.length - 1}
                  onClick={() => moveRule(i, 1)}
                  title="下移（降低优先级）"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={btn + ' hover:!text-red-400'}
                  onClick={() => void saveRules((rules ?? []).filter((rr) => rr.id !== rule.id))}
                >
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>

        {/* 新增规则 */}
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-neutral-800 p-3">
          <select
            value={draft.matchType}
            onChange={(e) => setDraft({ ...draft, matchType: e.target.value as RuleMatchType })}
            className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs outline-none focus:border-emerald-700"
          >
            <option value="domain">域名</option>
            <option value="keyword">关键词</option>
          </select>
          <input
            value={draft.pattern}
            onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}
            placeholder={draft.matchType === 'domain' ? '如 github.com' : '如 论文、arxiv'}
            className={input + ' min-w-0 flex-1'}
          />
          <span className="text-xs text-neutral-500">→</span>
          <input
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            list="category-options"
            placeholder="类别"
            className={input + ' w-32'}
          />
          <datalist id="category-options">
            {(categories ?? []).map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <button type="button" className={btn + ' !border-emerald-700 !text-emerald-400'} onClick={addRule}>
            添加规则
          </button>
        </div>
      </section>

      {/* 备份与恢复 */}
      <section className="mt-8">
        <h2 className="text-base font-semibold">备份与恢复</h2>
        <p className="mt-1 text-xs leading-relaxed text-neutral-500">
          导出内容：分组规则、分类清单、AI 模型配置与界面偏好（不含快照与分类缓存）。
          导入按「文件里有什么就恢复什么」，其余保持不变。
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-neutral-300">
            <input
              type="checkbox"
              className="accent-emerald-600"
              checked={exportIncludeKey}
              onChange={(e) => setExportIncludeKey(e.target.checked)}
            />
            导出时包含 API Key（含敏感信息，慎选）
          </label>
          <button type="button" className={btn} onClick={handleExport}>
            导出备份
          </button>
          <button type="button" className={btn} onClick={() => importFileRef.current?.click()}>
            导入备份
          </button>
          <input
            ref={importFileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void handleImport(file);
            }}
          />
          {importMsg && <span className="text-xs text-emerald-400">{importMsg}</span>}
        </div>
      </section>
    </main>
  );
}
