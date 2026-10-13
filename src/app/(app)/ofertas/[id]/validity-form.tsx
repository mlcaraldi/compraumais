"use client";

import { useActionState } from "react";
import { Button } from "@/components/core/Button";
import { updateValidityAction, type ActionState } from "./actions";

const field = {
  height: 36,
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface-card)",
  padding: "0 8px",
  fontFamily: "inherit",
  fontSize: 14,
} as const;

export function ValidityForm({
  id,
  name,
  startsOn,
  endsOn,
}: {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateValidityAction, {});
  return (
    <form action={action} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
      <input type="hidden" name="id" value={id} />
      <label style={{ display: "grid", gap: 4, fontSize: 14, fontWeight: 600 }}>
        Nome
        <input name="name" defaultValue={name} style={{ ...field, minWidth: 260 }} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 14, fontWeight: 600 }}>
        Início
        <input type="date" name="startsOn" defaultValue={startsOn} style={field} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 14, fontWeight: 600 }}>
        Fim
        <input type="date" name="endsOn" defaultValue={endsOn} style={field} />
      </label>
      <Button type="submit" size="sm" disabled={pending}>
        Salvar vigência
      </Button>
      {state.error && (
        <span role="alert" style={{ color: "var(--fg-accent)", fontSize: 14 }}>
          {state.error}
        </span>
      )}
      {state.ok && !pending && (
        <span style={{ color: "var(--fg-success)", fontSize: 14 }}>Vigência salva.</span>
      )}
    </form>
  );
}
