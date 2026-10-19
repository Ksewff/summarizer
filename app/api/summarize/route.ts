import { NextResponse } from "next/server";
import { extractFromText, extractFromUrl } from "@/lib/extract";
import { summarize } from "@/lib/summarize";
import type { SummarizeError } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 正文下限，低于这个长度摘要没有意义 */
const MIN_CHARS = 200;
/** 单次请求的输入上限，防止把服务端撑爆 */
const MAX_INPUT_CHARS = 200_000;

function fail(error: string, status: number) {
  return NextResponse.json<SummarizeError>({ error }, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("请求格式不对。", 400);
  }

  const raw = (body as { input?: unknown } | null)?.input;
  const input = typeof raw === "string" ? raw.trim() : "";

  if (!input) {
    return fail("先贴一个链接或一段正文。", 400);
  }

  if (input.length > MAX_INPUT_CHARS) {
    return fail(
      `内容太长了。一次最多 ${MAX_INPUT_CHARS.toLocaleString("zh-CN")} 个字符。`,
      413,
    );
  }

  // 是链接就走抓取，否则当成正文处理
  const looksLikeUrl = /^https?:\/\/\S+$/i.test(input);

  const extracted = looksLikeUrl
    ? await extractFromUrl(input)
    : { ok: true as const, article: extractFromText(input, "直接贴入的正文") };

  if (!extracted.ok) {
    return fail(extracted.error, 422);
  }

  const { article } = extracted;

  if (article.text.length < MIN_CHARS) {
    return fail(`正文太短。至少 ${MIN_CHARS} 字才能摘要。`, 422);
  }

  try {
    const result = await summarize(article);
    return NextResponse.json(result);
  } catch {
    return fail("摘要没能生成。稍后再试。", 500);
  }
}
