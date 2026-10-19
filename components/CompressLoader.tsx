import type { CSSProperties } from "react";
import styles from "./CompressLoader.module.css";

/**
 * 每根条代表原文的一行，宽度取自一组不规则的行宽比例。
 * 前 3 根的宽度刻意像一段文字（满行、次满行、短尾行）。
 */
const LINE_WIDTHS = [100, 92, 64, 100, 74, 92, 100, 61, 84, 38, 97, 55];

/** 压缩后「剩下的三句话」，不会被折叠 */
const KEPT_LINES = 3;

type Props = {
  /** 摘要已就绪、正在淡出时置 true */
  dimmed?: boolean;
};

export default function CompressLoader({ dimmed = false }: Props) {
  return (
    <div
      className={styles.loader}
      data-dim={dimmed || undefined}
      role="status"
      aria-busy="true"
    >
      <div className={styles.compress} aria-hidden="true">
        {LINE_WIDTHS.map((width, index) => (
          <span
            key={index}
            className={styles.bar}
            data-keep={index < KEPT_LINES || undefined}
            style={
              {
                "--i": index,
                "--w": `${width}%`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <span className="srOnly">正在读取网页，请稍候</span>
    </div>
  );
}
