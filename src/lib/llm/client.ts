/**
 * OpenAI 兼容 Chat Completions 客户端。
 *
 * - fetch / sleep 均可注入，便于单测
 * - 超时用 AbortController；外部 signal 取消会立即中止且不重试
 * - 网络错误 / 408 / 429 / 5xx 指数退避重试（默认额外重试 2 次）
 */
import type { LlmProviderConfig } from '../settings/types';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ChatResult {
  content: string;
  usage?: LlmUsage;
  latencyMs: number;
}

export interface ChatOptions {
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
}

export interface LlmDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

function joinEndpoint(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '') + '/chat/completions';
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

interface ChatCompletionsResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export function createLlmClient(config: LlmProviderConfig, deps: LlmDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch.bind(globalThis);
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  async function chatOnce(
    messages: ChatMessage[],
    opts: ChatOptions,
    signal: AbortSignal,
  ): Promise<ChatResult> {
    const startedAt = Date.now();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey && config.apiKey.trim() !== '') {
      headers.Authorization = 'Bearer ' + config.apiKey.trim();
    }

    const body: Record<string, unknown> = {
      model: config.model,
      messages,
      temperature: config.temperature ?? 0,
    };
    if (config.maxOutputTokens !== undefined) body.max_tokens = config.maxOutputTokens;

    let res: Response;
    try {
      res = await fetchImpl(joinEndpoint(config.baseUrl), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      // 外部取消：原样上抛（调用方据此区分「用户取消」与「网络失败」）
      if (opts.signal?.aborted) throw e;
      throw new LlmError('网络请求失败：' + (e instanceof Error ? e.message : String(e)));
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const detail = text ? ': ' + text.slice(0, 200) : '';
      throw new LlmError('HTTP ' + res.status + detail, res.status);
    }

    const json = (await res.json()) as ChatCompletionsResponse;
    const content = json.choices?.[0]?.message?.content ?? '';
    return {
      content,
      usage: json.usage
        ? {
            promptTokens: json.usage.prompt_tokens,
            completionTokens: json.usage.completion_tokens,
            totalTokens: json.usage.total_tokens,
          }
        : undefined,
      latencyMs: Date.now() - startedAt,
    };
  }

  async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
    if (!config.baseUrl || !config.model) throw new LlmError('LLM 配置不完整：缺少 baseUrl 或 model');

    const retries = opts.retries ?? 2;
    const timeoutMs = opts.timeoutMs ?? 30_000;

    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
      const onOuterAbort = (): void => controller.abort(opts.signal?.reason);
      opts.signal?.addEventListener('abort', onOuterAbort, { once: true });

      try {
        return await chatOnce(messages, opts, controller.signal);
      } catch (e) {
        if (opts.signal?.aborted) throw e; // 用户取消，不重试
        const retryable =
          e instanceof LlmError ? e.status !== undefined && RETRYABLE_STATUS.has(e.status) : true;
        if (!retryable || attempt >= retries) throw e;
        await sleep(500 * 2 ** attempt + Math.floor(Math.random() * 200));
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onOuterAbort);
      }
    }
  }

  /** 连通性测试：发一个极小请求。 */
  async function testConnection(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const startedAt = Date.now();
    try {
      await chat([{ role: 'user', content: 'ping' }], { timeoutMs: 15_000, retries: 0 });
      return { ok: true, latencyMs: Date.now() - startedAt };
    } catch (e) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  return { chat, testConnection };
}

export type LlmClient = ReturnType<typeof createLlmClient>;
