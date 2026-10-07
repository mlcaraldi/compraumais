"use client";

import { useActionState } from "react";
import { Button } from "@/components/core/Button";
import { uploadProductsAction, type UploadState } from "../importacoes/actions";

export function UploadProductsForm() {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadProductsAction, {});
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
        aria-label="Planilha de catálogo"
        style={{ fontSize: 14, maxWidth: 260 }}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando..." : "Importar catálogo"}
      </Button>
      {state.error && (
        <span style={{ color: "var(--fg-accent)", fontSize: 14 }}>{state.error}</span>
      )}
    </form>
  );
}
