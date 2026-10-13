import type { CSSProperties } from "react";

type Tone = "light" | "dark" | "mono-dark" | "mono-light";

const TONES: Record<Tone, { ring: string; acc: string; text: string; bg: string }> = {
  light: {
    ring: "var(--cm-verde-noite)",
    acc: "var(--cm-brasa)",
    text: "var(--cm-verde-noite)",
    bg: "var(--cm-verde-noite)",
  },
  dark: {
    ring: "var(--cm-farinha)",
    acc: "var(--cm-brasa)",
    text: "var(--cm-farinha)",
    bg: "var(--cm-verde-noite)",
  },
  "mono-dark": {
    ring: "var(--cm-verde-noite)",
    acc: "var(--cm-verde-noite)",
    text: "var(--cm-verde-noite)",
    bg: "var(--cm-verde-noite)",
  },
  "mono-light": {
    ring: "var(--cm-branco)",
    acc: "var(--cm-branco)",
    text: "var(--cm-branco)",
    bg: "var(--cm-verde-noite)",
  },
};

export interface LogoSymbolProps {
  size?: number;
  ring?: string;
  accent?: string;
  /** força versão reduzida (sem +); padrão: size < 32 */
  reduced?: boolean;
}

export function LogoSymbol({
  size = 48,
  ring = "var(--cm-verde-noite)",
  accent = "var(--cm-brasa)",
  reduced,
}: LogoSymbolProps) {
  const r = reduced ?? size < 32;
  const sw = r ? 9 : 8;
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ display: "block", flex: "none" }}
    >
      <circle
        cx="24"
        cy="24"
        r="16"
        fill="none"
        stroke={ring}
        strokeWidth={sw}
        pathLength="100"
        strokeDasharray={r ? "0 2 71 100" : "0 1.5 72 100"}
      />
      <circle
        cx="24"
        cy="24"
        r="16"
        fill="none"
        stroke={accent}
        strokeWidth={sw}
        pathLength="100"
        strokeDasharray={r ? "0 77 21 100" : "0 76.5 22 100"}
      />
      {!r && (
        <path d="M24 19.5v9M19.5 24h9" stroke={ring} strokeWidth="3.6" strokeLinecap="round" />
      )}
    </svg>
  );
}

export interface LogoProps {
  variant?: "horizontal" | "symbol" | "avatar" | "app";
  /** light = sobre fundo claro; dark = sobre Verde-noite; mono-* = uma cor */
  tone?: Tone;
  /** altura do símbolo (horizontal/symbol) ou diâmetro/lado (avatar/app), px */
  size?: number;
  style?: CSSProperties;
}

export function Logo({ variant = "horizontal", tone = "light", size = 48, style }: LogoProps) {
  const t = TONES[tone] ?? TONES.light;
  if (variant === "avatar" || variant === "app") {
    const inner = Math.round(size * 0.72);
    const onBg = tone.startsWith("mono")
      ? { ring: "var(--cm-branco)", acc: "var(--cm-branco)" }
      : { ring: "var(--cm-farinha)", acc: "var(--cm-brasa)" };
    return (
      <div
        role="img"
        aria-label="CompraMais"
        style={{
          width: size,
          height: size,
          borderRadius: variant === "avatar" ? "50%" : size * 0.233,
          background: t.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "none",
          ...style,
        }}
      >
        <LogoSymbol size={inner} ring={onBg.ring} accent={onBg.acc} reduced={size < 32} />
      </div>
    );
  }
  if (variant === "symbol") {
    return (
      <span role="img" aria-label="CompraMais" style={style}>
        <LogoSymbol size={size} ring={t.ring} accent={t.acc} />
      </span>
    );
  }
  return (
    <div
      role="img"
      aria-label="CompraMais"
      style={{ display: "inline-flex", alignItems: "center", gap: size * 0.22, ...style }}
    >
      <LogoSymbol size={size} ring={t.ring} accent={t.acc} />
      <span
        style={{
          fontFamily: "var(--cm-font-display)",
          fontWeight: 700,
          fontSize: size * 0.8,
          letterSpacing: "var(--text-wordmark-ls)",
          color: t.text,
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        CompraMais
      </span>
    </div>
  );
}
