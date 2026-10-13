"use client";

import { useActionState } from "react";
import { Button } from "@/components/core/Button";
import { recalculateAction, type ActionState } from "./actions";

export function RecalculateForm({ orderId, label }: { orderId: string; label: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(recalculateAction, {});
  return (
    <form action={action} style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <input type="hidden" name="orderId" value={orderId} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? "Calculando" : label}
      </Button>
      {state.error && (
        <span role="alert" style={{ color: "var(--fg-accent)", fontSize: 14 }}>
          {state.error}
        </span>
      )}
    </form>
  );
}
