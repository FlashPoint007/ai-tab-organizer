/**
 * LLM 分类结果解析：模型输出不可信，这里做多级容错。
 *
 * 1) 剥掉 Markdown 代码围栏与前后杂文；
 * 2) 直接 JSON.parse；
 * 3) 失败则做括号配平截取再 parse；
 * 4) 再失败退化为正则逐对提取 {"id":..,"category":".."}；
 * 5) 全程校验 id ∈ 合法集合、category ∈ 类别清单，非法丢弃。
 */
export interface ParsedAssignment {
  id: number;
  category: string;
}

function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
}

/** 从任意文本中截取第一段括号配平的 {...} 或 [...]。 */
export function extractBalancedJson(raw: string): string | null {
  const start = raw.search(/[{[]/);
  if (start === -1) return null;
  const open = raw[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  // 未配平（可能被截断）：把未闭合字符串收口后补齐括号
  let tail = raw.slice(start);
  if (inString) tail += '"';
  return tail + close.repeat(Math.max(depth, 1));
}

interface AssignmentsShape {
  assignments?: Array<{ id?: unknown; category?: unknown }>;
}

const PAIR_REGEX = /"id"\s*:\s*(\d+)\s*,\s*"category"\s*:\s*"([^"]{1,40})"/g;

export function parseAssignments(
  raw: string,
  validIds: ReadonlySet<number>,
  validCategories: ReadonlySet<string>,
): ParsedAssignment[] {
  const cleaned = stripFences(raw);
  const result: ParsedAssignment[] = [];
  const seenIds = new Set<number>();

  const pushIfValid = (id: unknown, category: unknown): void => {
    if (typeof id !== 'number' || typeof category !== 'string') return;
    if (!validIds.has(id) || seenIds.has(id)) return;
    const trimmed = category.trim();
    if (!trimmed || !validCategories.has(trimmed)) return;
    seenIds.add(id);
    result.push({ id, category: trimmed });
  };

  // 尝试 1/2/3：整体或截取后 JSON 解析
  const candidates: string[] = [cleaned];
  const balanced = extractBalancedJson(cleaned);
  if (balanced) candidates.unshift(balanced);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as AssignmentsShape | ParsedAssignment[];
      const list = Array.isArray(parsed) ? parsed : (parsed.assignments ?? []);
      for (const item of list) pushIfValid(item?.id, item?.category);
      if (result.length > 0) return result;
    } catch {
      // 继续降级
    }
  }

  // 尝试 4：逐对正则提取
  PAIR_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PAIR_REGEX.exec(cleaned)) !== null) {
    pushIfValid(Number(m[1]), m[2]);
  }
  return result;
}

export interface AdaptiveParseResult {
  categories: string[];
  assignments: ParsedAssignment[];
}

interface AdaptiveShape {
  categories?: unknown;
  assignments?: unknown;
}

function sanitizeCategories(input: unknown, max = 15): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const item of input) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || trimmed.length > 30) continue;
    seen.add(trimmed);
    if (seen.size >= max) break;
  }
  return [...seen];
}

/**
 * 解析自适应分类结果（{"categories":[...],"assignments":[...]}）。
 * assignments 的类别严格校验为模型自己给出的 categories；
 * 整体解析失败时降级为正则逐对提取（类别集合同样来自解析出的 categories）。
 */
export function parseAdaptiveResult(raw: string, validIds: ReadonlySet<number>): AdaptiveParseResult {
  const cleaned = stripFences(raw);

  let categories: string[] = [];
  let rawAssignments: unknown = null;

  const candidates: string[] = [cleaned];
  const balanced = extractBalancedJson(cleaned);
  if (balanced) candidates.unshift(balanced);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as AdaptiveShape;
      categories = sanitizeCategories(parsed.categories);
      if (parsed.assignments !== undefined || categories.length > 0) {
        rawAssignments = parsed.assignments ?? null;
        break;
      }
    } catch {
      // 继续降级
    }
  }

  const categorySet = new Set(categories);
  const assignments: ParsedAssignment[] = [];
  const seenIds = new Set<number>();

  const pushIfValid = (id: unknown, category: unknown): void => {
    if (typeof id !== 'number' || typeof category !== 'string') return;
    if (!validIds.has(id) || seenIds.has(id)) return;
    const trimmed = category.trim();
    if (!categorySet.has(trimmed)) return;
    seenIds.add(id);
    assignments.push({ id, category: trimmed });
  };

  if (Array.isArray(rawAssignments)) {
    for (const item of rawAssignments) {
      const a = item as { id?: unknown; category?: unknown };
      pushIfValid(a?.id, a?.category);
    }
  }
  if (assignments.length === 0) {
    PAIR_REGEX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PAIR_REGEX.exec(cleaned)) !== null) {
      pushIfValid(Number(m[1]), m[2]);
    }
  }

  return { categories, assignments };
}

/** 解析类别归纳结果（{"categories":[...]}），容错同上。 */
export function parseDiscoveredCategories(raw: string, max = 15): string[] {
  const cleaned = stripFences(raw);
  const candidates: string[] = [cleaned];
  const balanced = extractBalancedJson(cleaned);
  if (balanced) candidates.unshift(balanced);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as AdaptiveShape;
      const cats = sanitizeCategories(parsed.categories, max);
      if (cats.length > 0) return cats;
    } catch {
      // 继续
    }
  }
  // 最后兜底：抓取「categories":[...] 数组里的字符串
  const arrayMatch = cleaned.match(/"categories"\s*:\s*(\[[^\]]*\])/);
  if (arrayMatch?.[1]) {
    try {
      return sanitizeCategories(JSON.parse(arrayMatch[1]), max);
    } catch {
      return [];
    }
  }
  return [];
}
