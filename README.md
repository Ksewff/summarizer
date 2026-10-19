# Précis

把一篇长网页压成三句话。

## 跑起来

```bash
npm install
npm run dev
```

打开 http://localhost:3000

## 可选：接大模型

不配置也能用 —— 内置抽取式摘要器（词频 + 位置加成 + 贪心去重），完全离线。
配上任意 OpenAI 兼容接口后会自动切过去，接口报错时静默退回本地摘要。

| 环境变量 | 说明 | 默认 |
| --- | --- | --- |
| `PRECIS_LLM_API_KEY`（或 `OPENAI_API_KEY`） | 密钥 | 无，为空则用本地摘要 |
| `PRECIS_LLM_BASE_URL` | 兼容接口地址 | `https://api.openai.com/v1` |
| `PRECIS_LLM_MODEL` | 模型名 | `gpt-4o-mini` |

在项目根目录建 `.env.local`：

```
PRECIS_LLM_API_KEY=sk-xxxx
```

## 接口

`POST /api/summarize`

```jsonc
// 请求：链接或正文都行，自动识别
{ "input": "https://example.com/article" }

// 成功
{
  "sentences": ["……", "……", "……"],
  "meta": {
    "title": "文章标题",
    "site": "example.com",
    "chars": 3240,
    "readMinutes": 8,
    "method": "llm"        // 或 "extractive"
  }
}

// 失败
{ "error": "正文太短。至少 200 字才能摘要。" }
```

## 设计

色板、字阶、间距、动效的完整规范见 `app/globals.css` 的 Token 区块。
两条纪律：**全页只有一个动作色**（`--iris`），**只允许一次「用力」**（压缩加载动画）。

## 结构

```
app/
  layout.tsx                根布局
  page.tsx                  首页
  globals.css               设计 Token + 重置
  api/summarize/route.ts    摘要接口
components/
  SiteHeader · SiteFooter   页头页脚
  Summarizer                状态机：idle → loading → success | error
  SourceForm                输入框 + 生成按钮 + 提示
  CompressLoader            压缩加载动画
  SummarySheet              摘要结果
lib/
  extract.ts                网页正文抽取
  summarize.ts              摘要引擎（大模型 / 抽取式）
  types.ts                  共享类型
```
