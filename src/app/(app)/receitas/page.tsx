import Link from "next/link";
import { Badge } from "@/components/core/Badge";
import { Button } from "@/components/core/Button";
import { Card } from "@/components/core/Card";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { recipesRepo } from "@/server/repos";
import { createRecipeAction } from "./actions";
import { UploadRecipesForm } from "./upload-form";

export const dynamic = "force-dynamic";

const field = {
  height: 40,
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface-card)",
  padding: "0 8px",
  fontFamily: "inherit",
  fontSize: 14,
} as const;

export default async function ReceitasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; erro?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const rows = await recipesRepo.listRecipes(getDb(), user.tenantId, sp.q);
  return (
    <>
      <PageHeader
        title="Receitas"
        subtitle={`${rows.length} receitas. O motor usa os ingredientes âncora para decidir quando sugerir uma receita.`}
        actions={<UploadRecipesForm />}
      />
      {sp.erro && (
        <Card tone="dashed" style={{ marginBottom: 16, color: "var(--fg-accent)" }}>
          {sp.erro}
        </Card>
      )}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <form method="get" style={{ display: "flex", gap: 8 }}>
          <input
            name="q"
            defaultValue={sp.q}
            placeholder="Buscar receita"
            aria-label="Buscar receita"
            style={{ ...field, minWidth: 240 }}
          />
          <Button type="submit" size="sm" variant="secondary">
            Buscar
          </Button>
        </form>
        <form action={createRecipeAction} style={{ display: "flex", gap: 8 }}>
          <input
            name="name"
            placeholder="Nome da nova receita"
            aria-label="Nome da nova receita"
            required
            style={{ ...field, minWidth: 240 }}
          />
          <Button type="submit" size="sm">
            Nova receita
          </Button>
        </form>
      </div>
      <Card padding={0} style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--fg-2)" }}>
              {["Receita", "Ingredientes", "Segmentos", "Situação"].map((h) => (
                <th key={h} style={{ padding: "12px 16px", fontWeight: 500 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ recipe, itemCount, segmentNames }) => (
              <tr key={recipe.id} style={{ borderTop: "1px solid var(--border-1)" }}>
                <td style={{ padding: "10px 16px" }}>
                  <Link
                    href={`/receitas/${recipe.id}`}
                    style={{ color: "var(--fg-accent)", fontWeight: 600 }}
                  >
                    {recipe.name}
                  </Link>
                </td>
                <td className="tabular" style={{ padding: "10px 16px" }}>
                  {itemCount}
                </td>
                <td style={{ padding: "10px 16px", color: "var(--fg-2)" }}>
                  {segmentNames.join(", ") || "-"}
                </td>
                <td style={{ padding: "10px 16px" }}>
                  <Badge tone={recipe.status === "active" ? "success-soft" : "outline"}>
                    {recipe.status === "active" ? "ativa" : "rascunho"}
                  </Badge>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 24, color: "var(--fg-2)" }}>
                  Nenhuma receita ainda. Importe o CSV ou a ficha técnica, ou crie uma receita.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
