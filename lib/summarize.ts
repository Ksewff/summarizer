import type { Article, SummaryMethod, SummarizeResponse } from "./types";

const TARGET_SENTENCES = 3;
const MAX_SENTENCE_CHARS = 160;
const MIN_SENTENCE_CHARS = 10;
/** 中文阅读速度，字 / 分钟 */
const CHARS_PER_MINUTE = 400;
/** 交给大模型的正文上限 */
const LLM_TEXT_LIMIT = 12_000;

const HARD_END = new Set([
  "\u3002",
  "\uff01",
  "\uff1f",
  "\uff1b",
  "!",
  "?",
  ";",
]);

const SOFT_END = new Set(["\uff0c", ",", "\u3001", "\uff1a", ":"]);

/** 两字词组级的停用词：不引分词库也能压掉虚词噪音 */
const STOP_CJK = new Set([
  "\u8fd9\u4e2a", "\u90a3\u4e2a", "\u6211\u4eec", "\u4ed6\u4eec",
  "\u4f60\u4eec", "\u53ef\u4ee5", "\u56e0\u4e3a", "\u6240\u4ee5",
  "\u5982\u679c", "\u4f46\u662f", "\u800c\u4e14", "\u5c31\u662f",
  "\u4e0d\u662f", "\u4ec0\u4e48", "\u600e\u4e48", "\u8fd9\u6837",
  "\u90a3\u6837", "\u5df2\u7ecf", "\u8fd8\u662f", "\u901a\u8fc7",
  "\u8fdb\u884c", "\u5bf9\u4e8e", "\u5173\u4e8e", "\u4ee5\u53ca",
  "\u4e4b\u540e", "\u4e4b\u524d", "\u4e00\u4e2a", "\u4e00\u4e9b",
  "\u53ef\u80fd", "\u9700\u8981", "\u5f53\u524d", "\u76ee\u524d",
  "\u540c\u65f6", "\u8fd9\u4e9b", "\u90a3\u4e9b", "\u81ea\u5df1",
  "\u4e0d\u4ec5", "\u800c\u662f", "\u5e76\u4e14", "\u56e0\u6b64",
]);

const STOP_EN = new Set([
  "the", "and", "for", "that", "this", "with", "from", "have", "has",
  "had", "are", "was", "were", "will", "would", "can", "could", "should",
  "you", "your", "they", "their", "them", "but", "not", "its", "into",
  "than", "then", "there", "here", "what", "when", "where", "which",
  "who", "been", "being", "about", "over", "also", "more", "most",
  "some", "such", "only", "other", "these", "those", "very", "each",
]);

function clampSentence(sentence: string): string {
  if (sentence.length <= MAX_SENTENCE_CHARS) return sentence;

  const head = sentence.slice(0, MAX_SENTENCE_CHARS);
  let cut = -1;
  for (let i = head.length - 1; i >= 0; i -= 1) {
    if (SOFT_END.has(head[i])) {
      cut = i;
      break;
    }
  }
  return cut > 40 ? `${head.slice(0, cut + 1)}\u2026` : `${head}\u2026`;
}

function expandLongSentence(sentence: string): string[] {
  if (sentence.length <= MAX_SENTENCE_CHARS) return [sentence];

  const parts: string[] = [];
  let buffer = "";
  const threshold = MAX_SENTENCE_CHARS * 0.6;

  for (const ch of sentence) {
    buffer += ch;
    if (SOFT_END.has(ch) && buffer.length >= threshold) {
      parts.push(buffer.trim());
      buffer = "";
    }
  }
  if (buffer.trim()) parts.push(buffer.trim());

  return parts.length > 0 ? parts : [sentence];
}

function splitSentences(raw: string): string[] {
  const text = raw.replace(/\s+/g, " ").trim();
  const sentences: string[] = [];
  let buffer = "";

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    buffer += ch;

    let isEnd = HARD_END.has(ch);
    if (!isEnd && ch === ".") {
      const prev = text[i - 1] ?? "";
      const next = text[i + 1] ?? " ";
      // 小数点和英文缩写不算句末
      isEnd = !/\d/.test(prev) && /[\s)\]\uff09\u3011\u201d"']/.test(next);
    }
    if (!isEnd) continue;

    const sentence = buffer.trim();
    if (sentence) sentences.push(sentence);
    buffer = "";
  }

  const tail = buffer.trim();
  if (tail) sentences.push(tail);

  return sentences.flatMap(expandLongSentence);
}

/** 抽词：拉丁词 + 中文二字组，无需分词库 */
function extractTerms(sentence: string): string[] {
  const terms: string[] = [];

  for (const match of sentence.toLowerCase().matchAll(/[a-z][a-z'-]{2,}/g)) {
    if (!STOP_EN.has(match[0])) terms.push(match[0]);
  }

  const hanOnly = sentence.replace(/[^\u4e00-\u9fff]+/g, " ");
  for (const run of hanOnly.split(" ")) {
    for (let i = 0; i + 2 <= run.length; i += 1) {
      const bigram = run.slice(i, i + 2);
      if (!STOP_CJK.has(bigram)) terms.push(bigram);
    }
  }

  return terms;
}

function bigramSet(sentence: string): Set<string> {
  return new Set(extractTerms(sentence));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const item of a) if (b.has(item)) overlap += 1;
  return overlap / (a.size + b.size - overlap);
}

type Scored = {
  index: number;
  sentence: string;
  score: number;
  terms: Set<string>;
};

/**
 * 抽取式摘要：词频打分 + 位置加成 + 贪心去重，最后按原文顺序输出。
 * 没配大模型时用它兜底，完全离线。
 */
export function extractiveSummary(text: string): string[] {
  const sentences = splitSentences(text).filter(
    (sentence) => sentence.length >= MIN_SENTENCE_CHARS,
  );

  if (sentences.length === 0) return [];
  if (sentences.length <= TARGET_SENTENCES) return sentences.map(clampSentence);

  // 文档词频：出现在越多句子里的词越重要
  const frequency = new Map<string, number>();
  const termSets = sentences.map((sentence) => {
    const set = bigramSet(sentence);
    for (const term of set) {
      frequency.set(term, (frequency.get(term) ?? 0) + 1);
    }
    return set;
  });

  const total = sentences.length;
  const scored: Scored[] = sentences.map((sentence, index) => {
    const terms = termSets[index];

    let raw = 0;
    for (const term of terms) raw += frequency.get(term) ?? 0;

    // 除以长度的 0.65 次方：长句有优势，但不至于霸屏
    let score = raw / Math.pow(Math.max(4, terms.size), 0.65);

    // 开篇通常是主旨
    score *= 1 + 0.35 * (1 - index / total);
    if (index === 0) score *= 1.6;

    return { index, sentence, score, terms };
  });

  const picked: Scored[] = [];
  for (const candidate of [...scored].sort((a, b) => b.score - a.score)) {
    if (picked.length >= TARGET_SENTENCES) break;
    const tooSimilar = picked.some(
      (chosen) => jaccard(chosen.terms, candidate.terms) > 0.34,
    );
    if (!tooSimilar) picked.push(candidate);
  }

  return picked
    .sort((a, b) => a.index - b.index)
    .map((item) => clampSentence(item.sentence));
}

const SYSTEM_PROMPT =
  "你是摘要编辑。用不超过三句话概括用户给的文章，保留关键事实、数字与结论。" +
  "每句都是完整的中文句子，不要编号、不要小标题、不要复述标题、不要输出 Markdown。" +
  '只输出 JSON，格式为 {"sentences":["第一句","第二句","第三句"]}。';

/**
 * 配了 PRECIS_LLM_API_KEY 或 OPENAI_API_KEY 就走大模型；
 * 任何一步失败都返回 null，由上层静默退回抽取式摘要。
 */
async function summarizeWithLlm(article: Article): Promise<string[] | null> {
  const apiKey = process.env.PRECIS_LLM_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = (
    process.env.PRECIS_LLM_BASE_URL ?? "https://api.openai.com/v1"
  ).replace(/\/+$/, "");
  const model = process.env.PRECIS_LLM_MODEL ?? "gpt-4o-mini";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `标题：${article.title}\n\n正文：\n${article.text.slice(0, LLM_TEXT_LIMIT)}`,
          },
        ],
      }),
    });

    if (!res.ok) return null;

    const data: unknown = await res.json();
    const content = (data as { choices?: { message?: { content?: unknown } }[] })
      ?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;

    const parsed = JSON.parse(content) as { sentences?: unknown };
    if (!Array.isArray(parsed.sentences)) return null;

    const cleaned = parsed.sentences
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, TARGET_SENTENCES);

    return cleaned.length > 0 ? cleaned : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function summarize(article: Article): Promise<SummarizeResponse> {
  const chars = article.text.length;

  const viaLlm = await summarizeWithLlm(article);
  const sentences = viaLlm ?? extractiveSummary(article.text);
  const method: SummaryMethod = viaLlm ? "llm" : "extractive";

  if (sentences.length === 0) {
    throw new Error("EMPTY_SUMMARY");
  }

  return {
    sentences: sentences.slice(0, TARGET_SENTENCES),
    meta: {
      title: article.title,
      site: article.site,
      chars,
      readMinutes: Math.max(1, Math.round(chars / CHARS_PER_MINUTE)),
      method,
    },
  };
}
