/** OpenAI 兼容 Provider 预设：选一个预设即可填好 baseUrl 与默认模型。 */

export interface LlmPreset {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
  /** 是否需要 API Key（本地服务不需要） */
  needsApiKey: boolean;
  hint?: string;
}

export const LLM_PRESETS: readonly LlmPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    needsApiKey: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    needsApiKey: true,
  },
  {
    id: 'moonshot',
    name: 'Kimi (Moonshot)',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    needsApiKey: true,
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    needsApiKey: true,
  },
  {
    id: 'dashscope',
    name: '阿里通义 Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    needsApiKey: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    needsApiKey: true,
  },
  {
    id: 'ollama',
    name: 'Ollama（本机）',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen2.5:3b',
    needsApiKey: false,
    hint: '先在本机运行：ollama serve，并 ollama pull qwen2.5:3b',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio（本机）',
    baseUrl: 'http://localhost:1234/v1',
    defaultModel: 'local-model',
    needsApiKey: false,
    hint: '在 LM Studio 的 Developer 标签启动本地服务',
  },
  {
    id: 'custom',
    name: '自定义…',
    baseUrl: '',
    defaultModel: '',
    needsApiKey: false,
  },
];

export function findPreset(id: string): LlmPreset | undefined {
  return LLM_PRESETS.find((p) => p.id === id);
}

/** 从 baseUrl 推导授权 origin（用于动态申请 host 权限）。 */
export function originFromBaseUrl(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.origin}/*`;
  } catch {
    return null;
  }
}
