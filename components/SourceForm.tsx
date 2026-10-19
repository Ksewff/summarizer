"use client";

import styles from "./Summarizer.module.css";

type Props = {
  value: string;
  hint: string;
  hintId: string;
  busy: boolean;
  canSubmit: boolean;
  isError: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
};

function LinkGlyph() {
  return (
    <svg
      className={styles.glyph}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07L11.3 4.63" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.7-1.7" />
    </svg>
  );
}

function ClearGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function WarnGlyph() {
  return (
    <svg
      className={styles.warn}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16.5h.01" />
    </svg>
  );
}

export default function SourceForm({
  value,
  hint,
  hintId,
  busy,
  canSubmit,
  isError,
  onChange,
  onSubmit,
  onClear,
}: Props) {
  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className={styles.fieldRow}>
        <label className="srOnly" htmlFor="precis-source">
          网页链接或正文
        </label>

        <div className={styles.field} data-error={isError || undefined}>
          <LinkGlyph />

          <input
            id="precis-source"
            className={styles.input}
            type="text"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="https://"
            value={value}
            readOnly={busy}
            aria-invalid={isError || undefined}
            aria-describedby={hintId}
            onChange={(event) => onChange(event.target.value)}
          />

          {value !== "" && !busy && (
            <button
              type="button"
              className={styles.clear}
              onClick={onClear}
              aria-label="清空"
            >
              <ClearGlyph />
            </button>
          )}
        </div>

        <button
          type="submit"
          className={styles.submit}
          disabled={!canSubmit}
          data-busy={busy || undefined}
        >
          {busy ? (
            <>
              <span className={styles.pulse} aria-hidden="true" />
              正在读取
            </>
          ) : (
            "生成摘要"
          )}
        </button>
      </div>

      <p
        id={hintId}
        className={styles.hint}
        data-error={isError || undefined}
        aria-live="polite"
      >
        {isError && <WarnGlyph />}
        {hint}
      </p>
    </form>
  );
}
