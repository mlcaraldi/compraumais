"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/core/Button";
import { Card } from "@/components/core/Card";
import { recordOutcomeAction, type ActionState } from "./actions";

const field = {
  height: 36,
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface-card)",
  padding: "0 8px",
  fontFamily: "inherit",
  fontSize: 14,
} as const;

export function OutcomeForm({
  orderId,
  items,
  disabled,
}: {
  orderId: string;
  items: { productId: string; name: string }[];
  disabled: boolean;
}) {
  const [result, setResult] = useState("");
  const [state, action, pending] = useActionState<ActionState, FormData>(recordOutcomeAction, {});
  return (
    <Card>
      <h2 style={{ fontSize: "var(--text-h3)", margin: "0 0 12px" }}>Registrar resultado</h2>
      <form action={action} style={{ display: "grid", gap: 12 }}>
        <input type="hidden" name="orderId" value={orderId} />
        <label style={{ display: "grid", gap: 4, fontSize: 14, fontWeight: 600 }}>
          Resultado
          <select
            name="result"
            value={result}
            onChange={(e) => setResult(e.target.value)}
            style={field}
            disabled={disabled}
          >
            <option value="">Escolha</option>
            <option value="accepted">Aceitou</option>
            <option value="partial">Aceitou parte</option>
            <option value="declined">Recusou</option>
            <option value="no_response">Sem resposta</option>
            <option value="not_sent">Não enviei</option>
          </select>
        </label>
        {result === "partial" && (
          <fieldset style={{ border: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
            <legend style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              Itens aceitos
            </legend>
            {items.map((i) => (
              <label key={i.productId} style={{ display: "flex", gap: 8, fontSize: 14 }}>
                <input type="checkbox" name="accepted" value={i.productId} />
                {i.name}
              </label>
            ))}
          </fieldset>
        )}
        <label style={{ display: "grid", gap: 4, fontSize: 14, fontWeight: 600 }}>
          Observação
          <textarea
            name="note"
            rows={2}
            style={{ ...field, height: "auto", padding: 8 }}
            disabled={disabled}
          />
        </label>
        <div>
          <Button type="submit" disabled={disabled || pending || !result}>
            Registrar
          </Button>
        </div>
        {state.error && (
          <p role="alert" style={{ color: "var(--fg-accent)", fontSize: 14, margin: 0 }}>
            {state.error}
          </p>
        )}
        {state.ok && !pending && (
          <p style={{ color: "var(--fg-success)", fontSize: 14, margin: 0 }}>
            Resultado registrado.
          </p>
        )}
      </form>
    </Card>
  );
}
