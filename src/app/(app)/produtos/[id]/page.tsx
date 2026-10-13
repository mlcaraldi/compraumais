import { notFound } from "next/navigation";
import { Button } from "@/components/core/Button";
import { Card } from "@/components/core/Card";
import { Input } from "@/components/core/Input";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { productsRepo } from "@/server/repos";
import { updateProductAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ProdutoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string; erro?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const p = await productsRepo.getProductById(getDb(), user.tenantId, id);
  if (!p) notFound();
  const price =
    p.listPriceCents === null ? "" : (p.listPriceCents / 100).toFixed(2).replace(".", ",");
  return (
    <>
      <PageHeader title={p.description} subtitle={`Código ${p.code}`} />
      <Card style={{ maxWidth: 640 }}>
        <form action={updateProductAction} style={{ display: "grid", gap: 12 }}>
          <input type="hidden" name="id" value={p.id} />
          <Input label="Descrição" name="description" defaultValue={p.description} required />
          <Input label="Marca" name="brand" defaultValue={p.brand ?? ""} />
          <Input
            label="Embalagem"
            name="packText"
            defaultValue={p.packText ?? ""}
            hint={
              p.packUnitSize
                ? `Lido como ${p.packQty} × ${p.packUnitSize} ${p.packUnit}`
                : "Ex.: 20X400G, CX C/12 UN, 5KG"
            }
          />
          <Input
            label="Unidade de venda"
            name="saleUnit"
            defaultValue={p.saleUnit ?? ""}
            hint="un, pct, kg ou cx"
          />
          <Input label="Preço de lista" name="price" prefix="R$" numeric defaultValue={price} />
          <Input label="Categoria" name="category" defaultValue={p.category ?? ""} />
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 15 }}>
            <input type="checkbox" name="sellable" defaultChecked={p.sellable} /> Vendável (entra
            nas sugestões)
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Button type="submit">Salvar</Button>
            {sp.salvo && <span style={{ color: "var(--fg-success)", fontSize: 14 }}>Salvo.</span>}
            {sp.erro && <span style={{ color: "var(--fg-accent)", fontSize: 14 }}>{sp.erro}</span>}
          </div>
        </form>
      </Card>
    </>
  );
}
