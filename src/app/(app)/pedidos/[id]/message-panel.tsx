"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/core/Button";
import { Card } from "@/components/core/Card";
import { whatsappLink } from "@/server/engine/whatsapp";
import { saveMessageAction, type ActionState } from "./actions";

const field = {
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface-card)",
  padding: 10,
  fontFamily: "inherit",
  fontSize: 14,
  lineHeight: 1.5,
  width: "100%",
} as const;

export function MessagePanel({
  orderId,
  messageId,
  initialText,
  originalText,
  phoneE164,
  phoneKind,
  hasItems,
}: {
  orderId: string;
  messageId: string;
  initialText: string;
  originalText: string;
  phoneE164: string | null;
  phoneKind: string;
  hasItems: boolean;
}) {
  const [text, setText] = useState(initialText);
  const [copied, setCopied] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(saveMessageAction, {});
  const link = whatsappLink(phoneE164, phoneKind, text);
  const noWhatsapp = phoneKind === "landline" || phoneKind === "invalid" || !phoneE164;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.getElementById("mensagem") as HTMLTextAreaElement | null;
      el?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <Card>
      <h2 style={{ fontSize: "var(--text-h3)", margin: "0 0 12px" }}>Mensagem para o cliente</h2>
      {!hasItems && (
        <p style={{ color: "var(--fg-2)", fontSize: 14, marginTop: 0 }}>
          Sem itens para oferecer neste pedido. A mensagem abaixo só confirma o recebimento.
        </p>
      )}
      <div
        style={{
          background: "var(--cm-manjericao-claro)",
          borderRadius: 12,
          padding: "10px 12px",
          fontSize: 14,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          marginBottom: 12,
        }}
        aria-label="Prévia da mensagem"
      >
        {text}
      </div>
      <form action={action}>
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="messageId" value={messageId} />
        <textarea
          id="mensagem"
          name="text"
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Texto da mensagem"
          style={field}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <Button type="button" onClick={copy}>
            {copied ? "Copiado" : "Copiar"}
          </Button>
          {link ? (
            <a href={link} target="_blank" rel="noreferrer">
              <Button type="button" variant="secondary">
                Abrir no WhatsApp
              </Button>
            </a>
          ) : (
            <Button type="button" variant="secondary" disabled>
              Abrir no WhatsApp
            </Button>
          )}
          <Button type="submit" variant="ghost" disabled={pending || text === initialText}>
            Salvar edição
          </Button>
          {text !== originalText && (
            <Button type="button" variant="ghost" onClick={() => setText(originalText)}>
              Voltar ao texto original
            </Button>
          )}
        </div>
        {noWhatsapp && (
          <p style={{ fontSize: 13, color: "var(--fg-2)", marginBottom: 0 }}>
            O telefone do cliente não serve para WhatsApp (fixo, inválido ou ausente). Copie o texto
            e use outro canal.
          </p>
        )}
        {state.error && (
          <p role="alert" style={{ color: "var(--fg-accent)", fontSize: 14, marginBottom: 0 }}>
            {state.error}
          </p>
        )}
        {state.ok && !pending && text === initialText && (
          <p style={{ color: "var(--fg-success)", fontSize: 14, marginBottom: 0 }}>Edição salva.</p>
        )}
      </form>
    </Card>
  );
}
