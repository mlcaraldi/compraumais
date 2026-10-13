"use client";

import { useActionState } from "react";
import { Button } from "@/components/core/Button";
import { uploadOrderAction, type UploadState } from "./actions";

export function UploadOrderForm() {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadOrderAction, {});
  return (
    <form
      action={action}
      style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
    >
      <input
        type="file"
        name="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        required
        aria-label="Arquivo do pedido"
        style={{ fontSize: 14, maxWidth: 260 }}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando..." : "Subir pedido"}
      </Button>
      {state.error && (
        <span style={{ color: "var(--fg-accent)", fontSize: 14 }}>{state.error}</span>
      )}
    </form>
  );
}
