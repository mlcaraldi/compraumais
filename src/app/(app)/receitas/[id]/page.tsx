import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/core/Badge";
import { Button } from "@/components/core/Button";
import { Card } from "@/components/core/Card";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { formatCents } from "@/server/normalize";
import { recipesRepo, segmentsRepo } from "@/server/repos";
import {
  addItemAction,
  linkProductAction,
  removeItemAction,
  reviewLinkAction,
  saveItemAction,
  saveRecipeAction,
  suggestProductsAction,
} from "../actions";

export const dynamic = "force-dynamic";

const field = {
  height: 36,
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface-card)",
  padding: "0 8px",
  fontFamily: "inherit",
  fontSize: 14,
} as const;

const LINK_LABEL = { approved: "aprovado", suggested: "sugerido", rejected: "rejeitado" } as const;

export default async function ReceitaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; ing?: string; q?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();
  const recipe = await recipesRepo.getRecipe(db, user.tenantId, id);
  if (!recipe) notFound();
  const [items, segments, selected] = await Promise.all([
    recipesRepo.listRecipeItems(db, user.tenantId, id),
    segmentsRepo.listSegments(db, user.tenantId),
    recipesRepo.listRecipeSegmentIds(db, user.tenantId, id),
  ]);
  const links = await recipesRepo.listIngredientLinks(
    db,
    user.tenantId,
    items.map((i) => i.ingredient.id),
  );
  const searchIngredient = items.find((i) => i.ingredient.id === sp.ing)?.ingredient;
  const found = searchIngredient
    ? await recipesRepo.searchProductsByTrigram(
        db,
        user.tenantId,
        sp.q?.trim() || searchIngredient.name,
        10,
      )
    : [];
  const anchors = items.filter((i) => i.item.isAnchor).length;
  return (
    <>
      <PageHeader
        title={recipe.name}
        subtitle={`${items.length} ingredientes, ${anchors} âncora(s)`}
        actions={
          <Link href="/receitas" style={{ color: "var(--fg-accent)", fontWeight: 600 }}>
            ← Receitas
          </Link>
        }
      />
      {sp.erro && (
        <Card tone="dashed" style={{ marginBottom: 16, color: "var(--fg-accent)" }}>
          {sp.erro}
        </Card>
      )}
      <div style={{ display: "grid", gap: 16 }}>
        <Card>
          <form action={saveRecipeAction} style={{ display: "grid", gap: 12 }}>
            <input type="hidden" name="id" value={recipe.id} />
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label style={{ display: "grid", gap: 4, fontSize: 14, flex: "1 1 280px" }}>
                <span style={{ fontWeight: 600 }}>Nome</span>
                <input name="name" defaultValue={recipe.name} required style={field} />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 14, width: 120 }}>
                <span style={{ fontWeight: 600 }}>Rendimento</span>
                <input
                  name="yieldPortions"
                  type="number"
                  min={1}
                  defaultValue={recipe.yieldPortions}
                  style={field}
                />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 14, width: 160 }}>
                <span style={{ fontWeight: 600 }}>Situação</span>
                <select name="status" defaultValue={recipe.status} style={field}>
                  <option value="active">Ativa</option>
                  <option value="draft">Rascunho</option>
                </select>
              </label>
            </div>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Segmentos</legend>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {segments.map((s) => (
                  <label key={s.id} style={{ display: "flex", gap: 6, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      name="segmentIds"
                      value={s.id}
                      defaultChecked={selected.includes(s.id)}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <Button type="submit">Salvar receita</Button>
            </div>
          </form>
        </Card>

        <Card padding={0} style={{ overflowX: "auto" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 16,
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <h2 style={{ fontSize: "var(--text-h3)", margin: 0 }}>Ingredientes</h2>
            <form action={suggestProductsAction}>
              <input type="hidden" name="recipeId" value={recipe.id} />
              <Button type="submit" size="sm" variant="secondary">
                Sugerir produtos
              </Button>
            </form>
          </div>
          {items.map(({ item, ingredient }) => {
            const mine = links.filter((l) => l.link.ingredientId === ingredient.id);
            const approved = mine.some((l) => l.link.status === "approved");
            return (
              <div
                key={item.id}
                id={`item-${item.id}`}
                style={{
                  borderTop: "1px solid var(--border-1)",
                  padding: 16,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <strong style={{ minWidth: 220, flex: "1 1 220px" }}>{ingredient.name}</strong>
                  <form
                    action={saveItemAction}
                    style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
                  >
                    <input type="hidden" name="recipeId" value={recipe.id} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <input
                      name="qty"
                      defaultValue={String(Number(item.qtyPerPortion))}
                      aria-label="Quantidade por porção"
                      inputMode="decimal"
                      style={{ ...field, width: 80 }}
                      className="tabular"
                    />
                    <select name="unit" defaultValue={item.unit} aria-label="Unidade" style={field}>
                      <option value="g">g</option>
                      <option value="ml">ml</option>
                      <option value="un">un</option>
                    </select>
                    <label style={{ display: "flex", gap: 4, fontSize: 14 }}>
                      <input type="checkbox" name="isAnchor" defaultChecked={item.isAnchor} />
                      Âncora
                    </label>
                    <label style={{ display: "flex", gap: 4, fontSize: 14 }}>
                      <input type="checkbox" name="isEssential" defaultChecked={item.isEssential} />
                      Essencial
                    </label>
                    <Button type="submit" size="sm" variant="secondary">
                      Salvar
                    </Button>
                  </form>
                  <form action={removeItemAction}>
                    <input type="hidden" name="recipeId" value={recipe.id} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <Button type="submit" size="sm" variant="ghost">
                      Remover
                    </Button>
                  </form>
                </div>
                <div style={{ display: "grid", gap: 6, fontSize: 14 }}>
                  {mine.length === 0 && (
                    <span style={{ color: "var(--fg-2)" }}>Sem produto vinculado.</span>
                  )}
                  {!approved && mine.length > 0 && (
                    <span style={{ color: "var(--fg-accent)" }}>
                      Nenhum produto aprovado ainda.
                    </span>
                  )}
                  {mine.map(({ link, product }) => (
                    <div
                      key={link.id}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        flexWrap: "wrap",
                        opacity: link.status === "rejected" ? 0.55 : 1,
                      }}
                    >
                      <Badge
                        tone={
                          link.status === "approved"
                            ? "success-soft"
                            : link.status === "suggested"
                              ? "brasa"
                              : "outline"
                        }
                      >
                        {LINK_LABEL[link.status as keyof typeof LINK_LABEL]}
                      </Badge>
                      <span className="tabular">{product.code}</span>
                      <span>{product.description}</span>
                      {product.listPriceCents !== null && (
                        <span className="tabular" style={{ color: "var(--fg-2)" }}>
                          {formatCents(product.listPriceCents)}
                        </span>
                      )}
                      <form action={reviewLinkAction} style={{ display: "flex", gap: 4 }}>
                        <input type="hidden" name="recipeId" value={recipe.id} />
                        <input type="hidden" name="itemId" value={item.id} />
                        <input type="hidden" name="linkId" value={link.id} />
                        {link.status !== "approved" && (
                          <Button
                            type="submit"
                            name="op"
                            value="approve"
                            size="sm"
                            variant="secondary"
                          >
                            Aprovar
                          </Button>
                        )}
                        {link.status !== "rejected" && (
                          <Button type="submit" name="op" value="reject" size="sm" variant="ghost">
                            Rejeitar
                          </Button>
                        )}
                        <Button type="submit" name="op" value="remove" size="sm" variant="ghost">
                          Remover vínculo
                        </Button>
                      </form>
                    </div>
                  ))}
                </div>
                <form method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input type="hidden" name="ing" value={ingredient.id} />
                  <input
                    name="q"
                    defaultValue={sp.ing === ingredient.id ? sp.q : ""}
                    placeholder="Buscar produto para vincular"
                    aria-label={`Buscar produto para ${ingredient.name}`}
                    style={{ ...field, minWidth: 260 }}
                  />
                  <Button type="submit" size="sm" variant="ghost">
                    Buscar produto
                  </Button>
                </form>
                {searchIngredient?.id === ingredient.id && (
                  <div style={{ display: "grid", gap: 6, fontSize: 14 }}>
                    {found.length === 0 && (
                      <span style={{ color: "var(--fg-2)" }}>Nenhum produto parecido.</span>
                    )}
                    {found.map(({ product, score }) => (
                      <form
                        key={product.id}
                        action={linkProductAction}
                        style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
                      >
                        <input type="hidden" name="recipeId" value={recipe.id} />
                        <input type="hidden" name="itemId" value={item.id} />
                        <input type="hidden" name="ingredientId" value={ingredient.id} />
                        <input type="hidden" name="productId" value={product.id} />
                        <span className="tabular">{product.code}</span>
                        <span>{product.description}</span>
                        <span className="tabular" style={{ color: "var(--fg-2)" }}>
                          {Math.round(Number(score) * 100)}%
                        </span>
                        <Button type="submit" size="sm" variant="secondary">
                          Vincular e aprovar
                        </Button>
                      </form>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <form
            action={addItemAction}
            style={{
              borderTop: "1px solid var(--border-1)",
              padding: 16,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <input type="hidden" name="recipeId" value={recipe.id} />
            <input
              name="name"
              placeholder="Novo ingrediente"
              aria-label="Novo ingrediente"
              required
              style={{ ...field, minWidth: 240 }}
            />
            <input
              name="qty"
              placeholder="Qtd"
              aria-label="Quantidade"
              required
              inputMode="decimal"
              style={{ ...field, width: 80 }}
            />
            <select name="unit" defaultValue="g" aria-label="Unidade" style={field}>
              <option value="g">g</option>
              <option value="ml">ml</option>
              <option value="un">un</option>
            </select>
            <Button type="submit" size="sm">
              Adicionar ingrediente
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
