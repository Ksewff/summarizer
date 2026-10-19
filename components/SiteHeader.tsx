import styles from "./SiteHeader.module.css";

export default function SiteHeader() {
  return (
    <header className={styles.header}>
      <a className={styles.wordmark} href="/">
        Précis
      </a>

      <details className={styles.help}>
        <summary className={styles.helpTrigger}>怎么用</summary>
        <div className={styles.helpPanel}>
          <p>贴一个网页链接，工具会读出正文，再压成三句话。</p>
          <p>也可以直接把正文粘进来，效果一样。</p>
          <p>摘要可能出错，重要内容请核对原文。</p>
        </div>
      </details>
    </header>
  );
}
