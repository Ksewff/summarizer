"use client";

import { useRef, useState } from "react";
import styles from "./SummarySheet.module.css";
import type { SummarizeResponse } from "@/lib/types";

type Props = {
  data: SummarizeResponse;
  onRegenerate: () => void;
};

export default function SummarySheet({ data, onRegenerate }: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  const { sentences, meta } = data;

  async function copy() {
    const text = sentences.join("");

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 剪贴板 API 不可用时退回手动选区
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.top = "-1000px";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }

    setCopied(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <article className={styles.sheet}>
      <p className={styles.meta}>
        {meta.site} · 原文 {meta.chars.toLocaleString("zh-CN")} 字 · 读它要约{" "}
        {meta.readMinutes} 分钟
      </p>

      {meta.title && meta.title !== "未命名页面" && (
        <h2 className={styles.docTitle}>{meta.title}</h2>
      )}

      <div className={styles.body}>
        {sentences.map((sentence, index) => (
          <p key={index} className={styles.sentence}>
            {sentence}
          </p>
        ))}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.action} onClick={copy}>
          {copied ? "已复制" : "复制"}
        </button>
        <button type="button" className={styles.action} onClick={onRegenerate}>
          重新生成
        </button>
      </div>
    </article>
  );
}
