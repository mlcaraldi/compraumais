"use client";

import { useEffect, useState } from "react";
import { LogoSymbol } from "../brand/Logo";

export interface OfferItem {
  name: string;
  /** preço original, ex.: "38,90" */
  from: string;
  /** preço da oferta */
  to: string;
}

export interface WhatsAppOfferProps {
  clientName?: string;
  dish?: string;
  /** o que já está no pedido */
  have?: string;
  items: OfferItem[];
  total?: string;
  minutes?: number;
  time?: string;
  deliveryNote?: string;
  onAnswer?: (a: "sim" | "nao") => void;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m < 10 ? "0" : ""}${m}:${r < 10 ? "0" : ""}${r}`;
}

export function WhatsAppOffer({
  clientName = "Rafael",
  dish = "Smash da casa",
  have = "pão, carne e cheddar",
  items = [],
  total = "R$ 77,60",
  minutes = 8,
  time = "09:34",
  deliveryNote = "Entra no mesmo pedido, na entrega de amanhã.",
  onAnswer,
}: WhatsAppOfferProps) {
  const [left, setLeft] = useState(minutes * 60);
  const [reply, setReply] = useState<"sim" | "nao" | null>(null);
  const [prevMinutes, setPrevMinutes] = useState(minutes);
  if (prevMinutes !== minutes) {
    setPrevMinutes(minutes);
    setLeft(minutes * 60);
    setReply(null);
  }
  useEffect(() => {
    if (reply) return;
    const t = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(t);
  }, [reply]);
  const answer = (a: "sim" | "nao") => {
    if (reply || (a === "sim" && left === 0)) return;
    setReply(a);
    onAnswer?.(a);
  };
  const btn = {
    background: "none",
    border: "none",
    padding: 11,
    fontFamily: "var(--cm-font-sans)",
    fontSize: 14,
    cursor: "pointer",
  } as const;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        fontFamily: "var(--cm-font-sans)",
        color: "var(--fg-1)",
      }}
    >
      <div
        style={{
          background: "var(--surface-card)",
          borderRadius: 12,
          padding: 4,
          maxWidth: 300,
          boxShadow: "var(--shadow-bubble)",
        }}
      >
        <div
          style={{
            background: "var(--surface-inverse)",
            borderRadius: 9,
            overflow: "hidden",
            display: "grid",
            gridTemplateColumns: "1.1fr 1fr",
            height: 150,
          }}
        >
          <div
            style={{
              padding: 14,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <LogoSymbol size={22} ring="var(--cm-farinha)" />
            <div>
              <div
                style={{
                  fontFamily: "var(--cm-font-mono)",
                  fontSize: 9,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--fg-accent-on-dark)",
                }}
              >
                Ficha · {dish}
              </div>
              <div
                style={{
                  fontFamily: "var(--cm-font-display)",
                  fontWeight: 600,
                  fontSize: 17,
                  lineHeight: 1.1,
                  color: "var(--fg-inverse-1)",
                  marginTop: 6,
                }}
              >
                Faltam {items.length} itens pra receita
              </div>
            </div>
          </div>
          <div
            style={{
              background: "var(--placeholder-stripes-dark)",
              display: "flex",
              alignItems: "flex-end",
              padding: 8,
              fontFamily: "var(--cm-font-mono)",
              fontSize: 9,
              color: "var(--fg-inverse-2)",
            }}
          >
            foto · ingredientes
          </div>
        </div>
        <div style={{ padding: "10px 8px 4px", fontSize: 14, lineHeight: 1.45 }}>
          Oi, {clientName}! Seu pedido de hoje já tem {have} pro <b>{dish}</b>. Faltaram{" "}
          {items.length === 1 ? "um item" : `${items.length} itens`}:
          <div
            style={{
              fontVariantNumeric: "tabular-nums",
              margin: "10px 0",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontSize: 13,
            }}
          >
            {items.map((it, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>{it.name}</span>
                <span style={{ flex: "none", whiteSpace: "nowrap" }}>
                  <s style={{ color: "var(--fg-2)" }}>{it.from}</s> <b>{it.to}</b>
                </span>
              </div>
            ))}
          </div>
          {deliveryNote}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 8,
              fontSize: 12,
              color: "var(--fg-2)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--cm-font-mono)",
                color: "var(--fg-accent)",
                fontWeight: 600,
              }}
            >
              {left > 0 ? `⏱ Válido por ${fmt(left)}` : "Oferta encerrada"}
            </span>
            <span>{time}</span>
          </div>
        </div>
        <div style={{ display: "grid", borderTop: "1px solid var(--border-1)", marginTop: 6 }}>
          <button
            type="button"
            onClick={() => answer("sim")}
            style={{
              ...btn,
              fontWeight: 600,
              color: "var(--fg-success)",
              borderBottom: "1px solid var(--border-1)",
            }}
          >
            Sim, incluir no pedido
          </button>
          <button
            type="button"
            onClick={() => answer("nao")}
            style={{ ...btn, fontWeight: 500, color: "var(--fg-2)" }}
          >
            Não, obrigado
          </button>
        </div>
      </div>
      {reply && (
        <div
          style={{
            alignSelf: "flex-end",
            background: "var(--cm-manjericao-claro)",
            borderRadius: 12,
            padding: "8px 10px",
            fontSize: 14,
            maxWidth: "80%",
          }}
        >
          {reply === "sim" ? "Sim, incluir no pedido" : "Não, obrigado"}
        </div>
      )}
      {reply && (
        <div
          style={{
            background: "var(--surface-card)",
            borderRadius: 12,
            padding: "8px 10px",
            fontSize: 14,
            lineHeight: 1.45,
            maxWidth: 280,
          }}
        >
          {reply === "sim"
            ? `Pronto, ${clientName}! Os itens entraram no pedido e chegam amanhã junto com o resto. Total: ${total}.`
            : `Tudo certo, ${clientName}. Seu pedido segue como está. Bom serviço!`}
        </div>
      )}
    </div>
  );
}
