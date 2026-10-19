/** 从网页或粘贴文本中抽出的可摘要正文 */
export type Article = {
  /** 标题。抽不到时回退为"未命名页面" */
  title: string;
  /** 来源站点，展示在摘要上方 */
  site: string;
  /** 纯文本正文，段落之间以空行分隔 */
  text: string;
};

/** 摘要生成方式：调用大模型，或本地抽取 */
export type SummaryMethod = "llm" | "extractive";

export type SummaryMeta = {
  title: string;
  site: string;
  /** 原文正文字数 */
  chars: number;
  /** 按每分钟 400 字估算的阅读时长 */
  readMinutes: number;
  method: SummaryMethod;
};

/** POST /api/summarize 的成功响应 */
export type SummarizeResponse = {
  sentences: string[];
  meta: SummaryMeta;
};

/** POST /api/summarize 的失败响应 */
export type SummarizeError = {
  error: string;
};
