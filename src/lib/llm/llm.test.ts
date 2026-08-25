import { describe, expect, it, vi } from 'vitest';

import { createLlmClient, LlmError } from './client';
import {
  buildAdaptiveClassifyMessages,
  buildCategoryDiscoveryMessages,
  buildClassifyMessages,
} from './prompts';
import {
  extractBalancedJson,
  parseAdaptiveResult,
  parseAssignments,
  parseDiscoveredCategories,
} from './parser';
import { findPreset, LLM_PRESETS, originFromBaseUrl } from './presets';

// ================= client =================

function okResponse(content: string, totalTokens = 42): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: totalTokens },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

const baseConfig = {
  preset: 'custom',
  baseUrl: 'https://api.example.com/v1',
  model: 'test-model',
  apiKey: 'sk-test',
};

const instantSleep = (): Promise<void> => Promise.resolve();

describe('createLlmClient', () => {
  it('成功请求：端点拼接、鉴权头、返回内容与用量', async () => {
    const fetchMock = vi.fn(async () => okResponse('{"assignments":[]}'));
    const client = createLlmClient(baseConfig, { fetchImpl: fetchMock as unknown as typeof fetch });

    const result = await client.chat([{ role: 'user', content: 'hi' }]);
    expect(result.content).toBe('{"assignments":[]}');
    expect(result.usage?.totalTokens).toBe(42);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('test-model');
    expect(body.temperature).toBe(0);
  });

  it('baseUrl 带尾斜杠也能正确拼端点', async () => {
    const fetchMock = vi.fn(async () => okResponse('ok'));
    const client = createLlmClient(
      { ...baseConfig, baseUrl: 'https://api.example.com/v1/' },
      { fetchImpl: fetchMock as unknown as typeof fetch },
    );
    await client.chat([{ role: 'user', content: 'x' }]);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://api.example.com/v1/chat/completions',
    );
  });

  it('5xx 指数退避重试后成功', async () => {
    const responses = [
      Promise.resolve(new Response('boom', { status: 500 })),
      Promise.resolve(new Response('still boom', { status: 503 })),
      okResponse('final'),
    ];
    const fetchMock = vi.fn(() => responses.shift() ?? Promise.resolve(okResponse('fallback')));
    const client = createLlmClient(baseConfig, {
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleep: instantSleep,
    });

    const result = await client.chat([{ role: 'user', content: 'x' }], { retries: 2 });
    expect(result.content).toBe('final');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('400 等不可重试错误立即抛出', async () => {
    const fetchMock = vi.fn(async () => new Response('bad key', { status: 401 }));
    const sleep = vi.fn(instantSleep);
    const client = createLlmClient(baseConfig, { fetchImpl: fetchMock as unknown as typeof fetch, sleep });

    await expect(client.chat([{ role: 'user', content: 'x' }])).rejects.toThrow(/HTTP 401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('重试耗尽后抛最后一次错误', async () => {
    const fetchMock = vi.fn(async () => new Response('overload', { status: 429 }));
    const client = createLlmClient(baseConfig, {
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleep: instantSleep,
    });
    await expect(client.chat([{ role: 'user', content: 'x' }], { retries: 2 })).rejects.toBeInstanceOf(
      LlmError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('配置缺失直接报错且不发起请求', async () => {
    const fetchMock = vi.fn();
    const client = createLlmClient({ ...baseConfig, model: '' }, { fetchImpl: fetchMock as unknown as typeof fetch });
    await expect(client.chat([{ role: 'user', content: 'x' }])).rejects.toThrow(/配置不完整/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('testConnection 汇总成败与耗时', async () => {
    const bad = createLlmClient(baseConfig, {
      fetchImpl: (async () => new Response('no', { status: 401 })) as unknown as typeof fetch,
    });
    const badResult = await bad.testConnection();
    expect(badResult.ok).toBe(false);
    expect(badResult.error).toMatch(/HTTP 401/);

    const good = createLlmClient(baseConfig, {
      fetchImpl: (async () => okResponse('pong')) as unknown as typeof fetch,
    });
    const goodResult = await good.testConnection();
    expect(goodResult.ok).toBe(true);
  });
});

// ================= prompts =================

describe('buildClassifyMessages', () => {
  it('system 包含类别清单、格式约束与注入免疫提示；user 含全部标签行', () => {
    const messages = buildClassifyMessages(['A 类', 'B 类'], [
      { id: 1, title: 'GitHub', url: 'https://github.com' },
      { id: 2, title: '长'.repeat(200), url: 'https://e.com/' + 'x'.repeat(300) },
    ]);

    const systemMsg = messages.at(0);
    const userMsg = messages.at(1);
    expect(systemMsg?.role).toBe('system');
    expect(systemMsg?.content).toContain('A 类、B 类');
    expect(systemMsg?.content).toContain('assignments');
    expect(systemMsg?.content).toContain('忽略');

    expect(userMsg?.content).toContain('{id:1,title:"GitHub",url:"https://github.com"}');
    // 截断生效：标题 <=80，URL <=120
    const line2 = userMsg?.content.split('\n').find((l) => l.includes('id:2')) ?? '';
    const titlePart = line2.match(/title:"([^"]*)"/)?.[1] ?? '';
    expect(titlePart.length).toBeLessThanOrEqual(80);
    expect(line2).not.toContain('x'.repeat(120));
  });
});

// ================= parser =================

const ids = new Set([1, 2, 3]);
const cats = new Set(['开发工具', '学习资料']);

describe('buildAdaptiveClassifyMessages（自适应模式）', () => {
  it('要求模型自行归纳 3~8 类，带注入免疫与已有类别复用提示', () => {
    const messages = buildAdaptiveClassifyMessages(
      [{ id: 5, title: 'B站视频', url: 'https://b23.tv/x' }],
      ['学习资料'],
    );
    const system = messages.at(0)?.content ?? '';
    expect(system).toContain('4~12 个类别');
    expect(system).toContain('B站内部平台');
    expect(system).toContain('至多 15 个');
    expect(system).toContain('学习资料');
    expect(system).toContain('categories');
    expect(system).toContain('忽略');
    expect(messages.at(1)?.content).toContain('{id:5,title:"B站视频"');
  });

  it('buildCategoryDiscoveryMessages 只要求输出 categories', () => {
    const messages = buildCategoryDiscoveryMessages([{ id: 1, title: 'a', url: 'https://a.com' }]);
    expect(messages.at(0)?.content).toContain('"categories"');
    expect(messages.at(0)?.content).not.toContain('assignments');
  });
});

describe('parseAdaptiveResult', () => {
  const validIds = new Set([1, 2]);

  it('解析 categories + assignments，且 assignment 类别必须来自 categories', () => {
    const raw =
      '{"categories":["前端开发","视频娱乐"],"assignments":[{"id":1,"category":"前端开发"},{"id":2,"category":"不存在的类"}]}';
    const got = parseAdaptiveResult(raw, validIds);
    expect(got.categories).toEqual(['前端开发', '视频娱乐']);
    expect(got.assignments).toEqual([{ id: 1, category: '前端开发' }]);
  });

  it('围栏容错照常；类别去重且上限 15 个', () => {
    const cats = JSON.stringify({ categories: Array.from({ length: 20 }, (_, i) => '类' + i) });
    expect(parseAdaptiveResult(cats, validIds).categories.length).toBe(15);
    const fenced = '答案：\n```json\n{"categories":["A"],"assignments":[{"id":2,"category":"A"}]}\n```';
    expect(parseAdaptiveResult(fenced, validIds).assignments).toEqual([{ id: 2, category: 'A' }]);
  });

  it('parseDiscoveredCategories 解析与兜底', () => {
    expect(parseDiscoveredCategories('{"categories":["X","Y","Z"]}')).toEqual(['X', 'Y', 'Z']);
    expect(parseDiscoveredCategories('垃圾文本 {"categories": ["唯一"]} 尾部')).toEqual(['唯一']);
    expect(parseDiscoveredCategories('完全无法解析')).toEqual([]);
  });
});

describe('parseAssignments', () => {
  it('解析干净 JSON', () => {
    const raw = '{"assignments":[{"id":1,"category":"开发工具"},{"id":2,"category":"学习资料"}]}';
    expect(parseAssignments(raw, ids, cats)).toEqual([
      { id: 1, category: '开发工具' },
      { id: 2, category: '学习资料' },
    ]);
  });

  it('剥掉 Markdown 围栏与前后废话', () => {
    const raw = '好的，结果如下：\n```json\n{"assignments":[{"id":3,"category":"开发工具"}]}\n```\n以上。';
    expect(parseAssignments(raw, ids, cats)).toEqual([{ id: 3, category: '开发工具' }]);
  });

  it('括号配平救回被截断的 JSON（未闭合字符串收口）', () => {
    const raw = '{"assignments":[{"id":1,"category":"开发工具"},{"id":2,"category":"学习资';
    const got = parseAssignments(raw, ids, cats);
    expect(got.some((a) => a.id === 1 && a.category === '开发工具')).toBe(true);
  });

  it('完全坏掉时退化为正则逐对提取', () => {
    const raw = '前缀 {"id":1,"category":"开发工具"} 中间垃圾 {"id":2, "category" : "学习资料"} 结尾';
    expect(parseAssignments(raw, ids, cats)).toEqual([
      { id: 1, category: '开发工具' },
      { id: 2, category: '学习资料' },
    ]);
  });

  it('过滤非法 id 与不在类别清单里的输出，并去重', () => {
    const raw =
      '{"assignments":[{"id":9,"category":"开发工具"},{"id":1,"category":"不存在的类"},{"id":1,"category":"开发工具"},{"id":1,"category":"学习资料"}]}';
    expect(parseAssignments(raw, ids, cats)).toEqual([{ id: 1, category: '开发工具' }]);
  });

  it('extractBalancedJson 处理数组开头与转义引号', () => {
    expect(extractBalancedJson('xx [{"a":1}] yy')).toBe('[{"a":1}]');
    // 用 fromCharCode 构造反斜杠，避免测试源码自身的多重转义
    const bs = String.fromCharCode(92);
    const escapedInput = '{"s":"a' + bs + '"b"}';
    expect(extractBalancedJson(escapedInput)).toBe(escapedInput);
  });
});

// ================= presets =================

describe('presets', () => {
  it('本地服务不需要 apiKey；预设可反查', () => {
    const ollama = findPreset('ollama');
    expect(ollama?.needsApiKey).toBe(false);
    expect(findPreset('deepseek')?.defaultModel).toBe('deepseek-chat');
    expect(findPreset('nope')).toBeUndefined();
  });

  it('每个非自定义预设都有合法 https 或本机 http 地址', () => {
    for (const p of LLM_PRESETS) {
      if (p.id === 'custom') continue;
      expect(originFromBaseUrl(p.baseUrl)).not.toBeNull();
    }
  });

  it('originFromBaseUrl 推导授权 origin', () => {
    expect(originFromBaseUrl('https://api.deepseek.com/v1')).toBe('https://api.deepseek.com/*');
    expect(originFromBaseUrl('http://localhost:11434/v1')).toBe('http://localhost:11434/*');
    expect(originFromBaseUrl('ftp://bad')).toBeNull();
  });
});
