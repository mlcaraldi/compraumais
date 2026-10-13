"use client";

import { useActionState } from "react";
import { Button } from "@/components/core/Button";
import { uploadRecipesAction, type UploadState } from "./actions";

export function UploadRecipesForm() {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadRecipesAction, {});
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
        aria-label="Arquivo de receitas"
        style={{ fontSize: 14, maxWidth: 260 }}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando..." : "Importar receitas"}
      </Button>
      {state.error && (
        <span style={{ color: "var(--fg-accent)", fontSize: 14 }}>{state.error}</span>
      )}
    </form>
  );
}
