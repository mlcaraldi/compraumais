import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/core/Badge";
import { Button } from "@/components/core/Button";
import { Card } from "@/components/core/Card";
import { Input } from "@/components/core/Input";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { customersRepo, recipesRepo, segmentsRepo } from "@/server/repos";
import {
  addCustomerRecipeAction,
  removeCustomerRecipeAction,
  saveCustomerRecipeAction,
  updateCustomerAction,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function ClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();
  const c = await customersRepo.getCustomerById(db, user.tenantId, id);
  if (!c) notFound();
  const segments = await segmentsRepo.listSegments(db, user.tenantId);
  const segment = segments.find((s) => s.id === c.segmentId)?.name;
  const [mine, suggested, allRecipes] = await Promise.all([
    recipesRepo.listCustomerRecipes(db, user.tenantId, id),
    recipesRepo.suggestRecipesForSegment(db, user.tenantId, id, c.segmentId),
    recipesRepo.listRecipes(db, user.tenantId),
  ]);
  const others = allRecipes.filter(
    (r) =>
      !mine.some((m) => m.recipe.id === r.recipe.id) &&
      !suggested.some((x) => x.recipe.id === r.recipe.id),
  );
  const kindLabel = {
    mobile: "celular",
    landline: "fixo, sem WhatsApp provável",
    invalid: "inválido",
  } as const;
  const rows: [string, string | null][] = [
    ["Razão social", c.legalName],
    ["Código", c.externalCode],
    ["CPF/CNPJ", c.document],
    ["Segmento", segment ?? null],
    ["Ramo no ERP", c.segmentRaw],
    ["Endereço", [c.address, c.addressNumber, c.district].filter(Boolean).join(", ") || null],
    ["Cidade", [c.city, c.state].filter(Boolean).join("/") || null],
    ["Cadastro", c.registeredAt?.split("-").reverse().join("/") ?? null],
    ["Última compra", c.lastPurchaseAt?.split("-").reverse().join("/") ?? null],
  ];
  return (
    <>
      <PageHeader
        title={c.tradeName ?? c.legalName}
        subtitle={c.legalName}
        actions={c.blocked ? <Badge tone="outline">Bloqueado</Badge> : undefined}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
        }}
      >
        <Card>
          <dl style={{ margin: 0, display: "grid", gap: 8, fontSize: 14 }}>
            {rows.map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <dt style={{ color: "var(--fg-2)" }}>{k}</dt>
                <dd className="tabular" style={{ margin: 0, textAlign: "right" }}>
                  {v ?? "-"}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card>
          <h2 style={{ fontSize: "var(--text-h3)", margin: "0 0 12px" }}>Contato</h2>
          <form action={updateCustomerAction} style={{ display: "grid", gap: 12 }}>
            <input type="hidden" name="id" value={c.id} />
            <Input
              label="Nome de contato"
              name="contactName"
              defaultValue={c.contactName ?? ""}
              hint="Usado na saudação da mensagem de WhatsApp"
            />
            <Input
              label="Telefone"
              name="phone"
              defaultValue={c.phoneRaw ?? ""}
              hint={
                c.phoneKind
                  ? `${c.phoneE164 ?? "sem número válido"} (${kindLabel[c.phoneKind as keyof typeof kindLabel]})`
                  : "Sem telefone"
              }
            />
            <Input label="Observações" name="notes" defaultValue={c.notes ?? ""} />
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Button type="submit">Salvar</Button>
              {sp.salvo && <span style={{ color: "var(--fg-success)", fontSize: 14 }}>Salvo.</span>}
            </div>
          </form>
        </Card>
      </div>
      <Card style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: "var(--text-h3)", margin: "0 0 12px" }}>Receitas do cliente</h2>
        {mine.length === 0 && (
          <p style={{ color: "var(--fg-2)", marginTop: 0 }}>Nenhuma receita associada ainda.</p>
        )}
        <div style={{ display: "grid", gap: 8 }}>
          {mine.map(({ link, recipe }) => (
            <div
              key={link.id}
              style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
            >
              <Link
                href={`/receitas/${recipe.id}`}
                style={{ color: "var(--fg-accent)", fontWeight: 600, minWidth: 220 }}
              >
                {recipe.name}
              </Link>
              <form action={saveCustomerRecipeAction} style={{ display: "flex", gap: 6 }}>
                <input type="hidden" name="customerId" value={c.id} />
                <input type="hidden" name="id" value={link.id} />
                <input
                  name="portions"
                  defaultValue={
                    link.portionsPerDay === null ? "" : String(Number(link.portionsPerDay))
                  }
                  placeholder="Porções por dia"
                  aria-label="Porções por dia"
                  inputMode="decimal"
                  style={{
                    height: 36,
                    width: 140,
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-strong)",
                    padding: "0 8px",
                    fontFamily: "inherit",
                  }}
                />
                <Button type="submit" size="sm" variant="secondary">
                  Salvar
                </Button>
              </form>
              <form action={removeCustomerRecipeAction}>
                <input type="hidden" name="customerId" value={c.id} />
                <input type="hidden" name="id" value={link.id} />
                <Button type="submit" size="sm" variant="ghost">
                  Remover
                </Button>
              </form>
            </div>
          ))}
        </div>
        {suggested.length > 0 && (
          <>
            <h3 style={{ fontSize: 16, margin: "20px 0 8px" }}>Sugeridas pelo segmento</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {suggested.map(({ recipe }) => (
                <form
                  key={recipe.id}
                  action={addCustomerRecipeAction}
                  style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
                >
                  <input type="hidden" name="customerId" value={c.id} />
                  <input type="hidden" name="recipeId" value={recipe.id} />
                  <input type="hidden" name="source" value="segment_suggestion" />
                  <span style={{ minWidth: 220 }}>{recipe.name}</span>
                  <Button type="submit" size="sm">
                    Confirmar
                  </Button>
                </form>
              ))}
            </div>
          </>
        )}
        {others.length > 0 && (
          <form
            action={addCustomerRecipeAction}
            style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}
          >
            <input type="hidden" name="customerId" value={c.id} />
            <input type="hidden" name="source" value="user" />
            <select
              name="recipeId"
              aria-label="Adicionar receita"
              style={{
                height: 36,
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-strong)",
                padding: "0 8px",
                fontFamily: "inherit",
                minWidth: 240,
              }}
            >
              {others.map(({ recipe }) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.name}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="secondary">
              Adicionar receita
            </Button>
          </form>
        )}
      </Card>
    </>
  );
}
