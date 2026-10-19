"use client";

import { useRef, useState } from "react";
import CompressLoader from "./CompressLoader";
import SourceForm from "./SourceForm";
import SummarySheet from "./SummarySheet";
import styles from "./Summarizer.module.css";
import type { SummarizeError, SummarizeResponse } from "@/lib/types";

/**
 * 压缩动画总时长。必须与 CompressLoader.module.css 里的时间轴保持一致：
 * 读取 0–960ms → 压缩 900–1600ms → 成文 2000–2450ms
 */
const ANIMATION_MS = 2600;

/** 载入动画淡出时长，与 CompressLoader 的 transition 一致 */
const MORPH_MS = 460;

const HINT_DEFAULT = "粘贴网页链接，或直接贴入正文。";
const HINT_LOADING = "正在读取网页，请稍候。";
const HINT_FALLBACK = "摘要没能生成。稍后再试。";

type Phase = "idle" | "loading" | "success" | "error";

export default function Summarizer() {
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [hint, setHint] = useState(HINT_DEFAULT);
  const [result, setResult] = useState<SummarizeResponse | null>(null);
  // 成功瞬间让加载层再留一会儿，实现「条 → 字」的交叉溶解
  const [morphing, setMorphing] = useState(false);

  /** 用来丢弃过期的请求结果（用户连点、中途清空） */
  const ticket = useRef(0);

  const busy = phase === "loading";
  const canSubmit = input.trim().length > 0 && !busy;

  async function submit() {
    const value = input.trim();
    if (!value || busy) return;

    const mine = ++ticket.current;
    setPhase("loading");
    setResult(null);
    setHint(HINT_LOADING);

    // 请求与动画并行跑，动画至少播完一遍，避免闪烁
    const curtain = new Promise<void>((resolve) => {
      window.setTimeout(resolve, ANIMATION_MS);
    });

    let payload: SummarizeResponse | null = null;
    let failure = HINT_FALLBACK;

    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: value }),
      });
      const data: unknown = await res.json();
      if (res.ok) {
        payload = data as SummarizeResponse;
      } else {
        failure = (data as SummarizeError)?.error || failure;
      }
    } catch {
      failure = "网络好像断了。检查连接后再试。";
    }

    await curtain;
    if (mine !== ticket.current) return;

    if (payload) {
      setResult(payload);
      setPhase("success");
      setHint(HINT_DEFAULT);
      setMorphing(true);
      window.setTimeout(() => setMorphing(false), MORPH_MS);
    } else {
      setPhase("error");
      setHint(failure);
    }
  }

  function clear() {
    ticket.current += 1;
    setInput("");
    setPhase("idle");
    setResult(null);
    setHint(HINT_DEFAULT);
    setMorphing(false);
  }

  return (
    <section className={styles.summarizer}>
      <div className={styles.hero}>
        <h1 className={styles.headline}>
          把一篇长网页
          <br />
          压成三句话。
        </h1>
        <p className={styles.lede}>粘贴链接，回车即生成。</p>
      </div>

      <SourceForm
        value={input}
        hint={hint}
        hintId="precis-hint"
        busy={busy}
        canSubmit={canSubmit}
        isError={phase === "error"}
        onChange={setInput}
        onSubmit={submit}
        onClear={clear}
      />

      <div className={styles.stage}>
        {(busy || morphing) && <CompressLoader dimmed={!busy} />}

        {phase === "idle" && (
          <p className={styles.empty}>摘要会显示在这里。</p>
        )}

        {phase === "error" && (
          <p className={styles.empty}>调整上面的内容，再试一次。</p>
        )}

        {phase === "success" && result && (
          <SummarySheet data={result} onRegenerate={submit} />
        )}
      </div>
    </section>
  );
}
