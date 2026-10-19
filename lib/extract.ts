import type { Article } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 PrecisBot/0.1";

const TIMEOUT_MS = 12_000;
const MAX_BYTES = 3_000_000;
const MIN_PARAGRAPH_CHARS = 24;

export type ExtractResult =
  | { ok: true; article: Article }
  | { ok: false; error: string };

/** 挡掉内网地址，避免拿服务端当跳板 */
const BLOCKED_HOST =
  /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?)/i;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ldquo: "\u201c",
  rdquo: "\u201d",
  lsquo: "\u2018",
  rsquo: "\u2019",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  middot: "\u00b7",
  copy: "\u00a9",
  reg: "\u00ae",
  times: "\u00d7",
};

function decodeEntities(input: string): string {
  return input.replace(
    /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi,
    (match, ref: string) => {
      if (ref.startsWith("#")) {
        const code =
          ref[1] === "x" || ref[1] === "X"
            ? Number.parseInt(ref.slice(2), 16)
            : Number.parseInt(ref.slice(1), 10);
        try {
          return Number.isFinite(code) && code > 0 && code <= 0x10ffff
            ? String.fromCodePoint(code)
            : match;
        } catch {
          return match;
        }
      }
      return NAMED_ENTITIES[ref.toLowerCase()] ?? match;
    },
  );
}

function pickLongest(html: string, pattern: RegExp): string | null {
  const matches = html.match(pattern);
  if (!matches || matches.length === 0) return null;
  return matches.reduce((longest, current) =>
    current.length > longest.length ? current : longest,
  );
}

function stripNoise(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(script|style|noscript|template|svg|iframe|canvas|video|audio|select|textarea|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      " ",
    )
    .replace(
      /<\/?(script|style|noscript|template|svg|iframe|canvas|video|audio|select|textarea|form)\b[^>]*>/gi,
      " ",
    );
}

function isolateContent(html: string): string {
  const article = pickLongest(html, /<article\b[^>]*>[\s\S]*?<\/article\s*>/gi);
  if (article) return article;

  const main = pickLongest(html, /<main\b[^>]*>[\s\S]*?<\/main\s*>/gi);
  if (main) return main;

  const body = /<body\b[^>]*>([\s\S]*)<\/body\s*>/i.exec(html);
  return body ? body[1] : html;
}

function dropChrome(html: string): string {
  return html.replace(
    /<(nav|aside|footer|header)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    " ",
  );
}

const CJK_RANGE = "\\u3000-\\u303f\\u4e00-\\u9fff\\uff00-\\uffef";
const CJK_GAP = new RegExp(`([${CJK_RANGE}])[ \\t]+(?=[${CJK_RANGE}])`, "g");

/** 内联标签会留下空格：中文之间的要抹掉，中英之间的要保留 */
function tidyCjkSpacing(line: string): string {
  let out = line;
  for (let i = 0; i < 8; i += 1) {
    const next = out.replace(CJK_GAP, "$1");
    if (next === out) break;
    out = next;
  }
  return out;
}

function toPlainText(html: string): string {
  const withBreaks = html
    .replace(/<br\b[^>]*>/gi, "\n")
    .replace(
      /<\/?(p|div|section|article|main|h[1-6]|li|ul|ol|tr|td|th|blockquote|figure|figcaption|pre|table|dt|dd|hr)\b[^>]*>/gi,
      "\n",
    );

  const withoutTags = withBreaks.replace(/<[^>]*>/g, " ");
  const decoded = decodeEntities(withoutTags);

  const paragraphs = decoded
    .split(/\n+/)
    .map((line) => tidyCjkSpacing(line.replace(/[ \t\u00a0]+/g, " ").trim()))
    .filter((line) => line.length >= MIN_PARAGRAPH_CHARS);

  return paragraphs.join("\n\n").trim();
}

function readMeta(html: string, name: string): string | null {
  const pattern = new RegExp(
    `<meta\\b[^>]*(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`,
    "i",
  );
  const reversed = new RegExp(
    `<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`,
    "i",
  );
  const match = pattern.exec(html) ?? reversed.exec(html);
  return match ? decodeEntities(match[1]).replace(/\s+/g, " ").trim() : null;
}

function readTitle(html: string): string {
  const fromHeading = (): string | null => {
    const match = /<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i.exec(html);
    if (!match) return null;
    return decodeEntities(match[1].replace(/<[^>]*>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
  };

  const fromTag = (): string | null => {
    const match = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
    if (!match) return null;
    return decodeEntities(match[1]).replace(/\s+/g, " ").trim();
  };

  const title =
    readMeta(html, "og:title") ??
    readMeta(html, "twitter:title") ??
    fromTag() ??
    fromHeading();

  if (!title) return "未命名页面";
  return title.slice(0, 160);
}

function readSite(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "未知来源";
  }
}

/** 用户直接粘贴正文时的入口，不做任何 HTML 解析 */
export function extractFromText(text: string, site: string): Article {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((line) => line.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter((line) => line.length > 0);

  return {
    title: "未命名页面",
    site,
    text: (paragraphs.length > 0 ? paragraphs : [text.trim()]).join("\n\n"),
  };
}

/** 边读边截断，避免被超大页面拖垮 */
async function readLimited(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return await res.text();

  const decoder = new TextDecoder("utf-8");
  let total = 0;
  let output = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    total += value.byteLength;
    output += decoder.decode(value, { stream: true });

    if (total >= MAX_BYTES) {
      await reader.cancel();
      break;
    }
  }

  return output + decoder.decode();
}

export async function extractFromUrl(rawUrl: string): Promise<ExtractResult> {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return { ok: false, error: "这个链接格式不对。检查一下再试。" };
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return { ok: false, error: "只支持 http 和 https 的链接。" };
  }

  if (BLOCKED_HOST.test(target.hostname)) {
    return { ok: false, error: "这个地址读不到。换一个公开的网页试试。" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(target.toString(), {
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
    });

    if (!res.ok) {
      return {
        ok: false,
        error: `这个链接打不开（${res.status}）。检查一下，或者直接把正文贴进来。`,
      };
    }

    const type = res.headers.get("content-type") ?? "";
    if (type !== "" && !/text\/html|application\/xhtml/i.test(type)) {
      return { ok: false, error: "这个链接不是网页。贴正文进来一样能摘要。" };
    }

    const html = await readLimited(res);
    const text = toPlainText(dropChrome(stripNoise(isolateContent(html))));

    if (!text) {
      return { ok: false, error: "这个页面没读出正文。试试直接把正文贴进来。" };
    }

    return {
      ok: true,
      article: {
        title: readTitle(html),
        site: readSite(target.toString()),
        text,
      },
    };
  } catch (error) {
    // 用 signal 判断超时，比依赖 error.name 稳
    if (controller.signal.aborted) {
      return {
        ok: false,
        error: "这个页面读得太慢了。稍后再试，或者直接把正文贴进来。",
      };
    }

    const code = (error as { cause?: { code?: string } } | null)?.cause?.code;

    if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
      return { ok: false, error: "找不到这个域名。检查一下链接。" };
    }

    if (
      code === "ECONNREFUSED" ||
      code === "ECONNRESET" ||
      code === "ETIMEDOUT" ||
      code === "UND_ERR_CONNECT_TIMEOUT" ||
      code === "UND_ERR_SOCKET"
    ) {
      return {
        ok: false,
        error: "连不上这个网站。换一个链接，或者直接把正文贴进来。",
      };
    }

    return {
      ok: false,
      error: "读这个链接的时候出错了。换一个链接，或者直接把正文贴进来。",
    };
  } finally {
    clearTimeout(timer);
  }
}
