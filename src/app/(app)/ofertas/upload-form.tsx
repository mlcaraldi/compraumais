"use client";

import { useActionState } from "react";
import { Button } from "@/components/core/Button";
import { uploadPromotionsAction, type UploadState } from "./actions";

export function UploadPromotionsForm() {
  const [state, action, pending] = useActionState<UploadState, FormData>(
    uploadPromotionsAction,
    {},
  );
  return (
    <form
      action={action}
      style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
    >
      <input
        type="file"
        name="files"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        required
        aria-label="Encartes de oferta"
        style={{ fontSize: 14, maxWidth: 280 }}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando..." : "Importar encartes"}
      </Button>
      {state.error && (
        <span style={{ color: "var(--fg-accent)", fontSize: 14 }}>{state.error}</span>
      )}
    </form>
  );
}
