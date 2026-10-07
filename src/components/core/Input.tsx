"use client";

import { useId, useState } from "react";
import type { CSSProperties, InputHTMLAttributes, ReactNode } from "react";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  label?: string;
  hint?: string;
  error?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  numeric?: boolean;
  wrapperStyle?: CSSProperties;
}

export function Input({
  label,
  hint,
  prefix,
  suffix,
  numeric = false,
  error,
  id,
  wrapperStyle,
  onFocus,
  onBlur,
  ...rest
}: InputProps) {
  const [focus, setFocus] = useState(false);
  const generated = useId();
  const fid = id ?? generated;
  return (
    <label
      htmlFor={fid}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        fontFamily: "var(--cm-font-sans)",
        ...wrapperStyle,
      }}
    >
      {label && (
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-1)" }}>{label}</span>
      )}
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 44,
          padding: "0 14px",
          background: "var(--surface-card)",
          borderRadius: "var(--radius-md)",
          border:
            "1px solid " +
            (error ? "var(--cm-brasa-escura)" : focus ? "var(--fg-1)" : "var(--border-strong)"),
          boxShadow: focus ? "0 0 0 3px var(--cm-foco)" : "none",
        }}
      >
        {prefix && <span style={{ color: "var(--fg-2)", fontSize: 15 }}>{prefix}</span>}
        <input
          id={fid}
          onFocus={(e) => {
            setFocus(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocus(false);
            onBlur?.(e);
          }}
          style={{
            flex: 1,
            minWidth: 0,
            border: "none",
            outline: "none",
            background: "transparent",
            fontFamily: "inherit",
            fontSize: 16,
            color: "var(--fg-1)",
            fontVariantNumeric: numeric ? "tabular-nums" : "normal",
          }}
          {...rest}
        />
        {suffix && (
          <span style={{ color: "var(--fg-2)", fontFamily: "var(--cm-font-mono)", fontSize: 13 }}>
            {suffix}
          </span>
        )}
      </span>
      {(error || hint) && (
        <span style={{ fontSize: 13, color: error ? "var(--fg-accent)" : "var(--fg-2)" }}>
          {error || hint}
        </span>
      )}
    </label>
  );
}
