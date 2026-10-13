"use client";

import { useActionState } from "react";
import { Button } from "@/components/core/Button";
import { uploadCustomersAction, type UploadState } from "../importacoes/actions";

export function UploadCustomersForm() {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadCustomersAction, {});
  return (
    <form
      action={action}
      style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
    >
      <input
        type="file"
        name="file"
        accept=".xlsx,.csv"
        required
        aria-label="Planilha de clientes"
        style={{ fontSize: 14, maxWidth: 260 }}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando..." : "Importar planilha"}
      </Button>
      {state.error && (
        <span style={{ color: "var(--fg-accent)", fontSize: 14 }}>{state.error}</span>
      )}
    </form>
  );
}
