import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/core/Badge";
import { Button } from "@/components/core/Button";
import { Card } from "@/components/core/Card";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { formatCents, titleCase } from "@/server/normalize";
import { promotionsRepo } from "@/server/repos";
import { closePromotionAction } from "./actions";
import { ValidityForm } from "./validity-form";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS: Record<string, string> = { active: "Ativa", expired: "Vencida", draft: "Rascunho" };
const UNIT: Record<string, string> = { un: "un", pct: "pacote", kg: "kg", cx: "caixa" };
const TYPE: Record<string, string> = {
  unit_price: "preço",
  min_qty: "quantidade mínima",
  bundle: "combo (não entra como preço)",
  other: "outra condição",
};

export default async function OfertaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const db = getDb();
  const promo = await promotionsRepo.getPromotion(db, user.tenantId, id);
  if (!promo) notFound();
  const items = await promotionsRepo.listPromotionItems(db, user.tenantId, id);
  return (
    <>
      <PageHeader
        title={promo.name}
        subtitle={promo.supplierBrand ?? undefined}
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Badge tone={promo.status === "active" ? "success-soft" : "outline"}>
              {STATUS[promo.status] ?? promo.status}
            </Badge>
            {promo.status === "active" && (
              <form action={closePromotionAction}>
                <input type="hidden" name="id" value={promo.id} />
                <Button type="submit" size="sm" variant="secondary">
                  Encerrar oferta
                </Button>
              </form>
            )}
          </div>
        }
      />
      <Card>
        <h2 style={{ fontSize: "var(--text-h3)", margin: "0 0 12px" }}>Vigência</h2>
        <ValidityForm
          id={promo.id}
          name={promo.name}
          startsOn={promo.startsOn}
          endsOn={promo.endsOn}
        />
        <p style={{ fontSize: 13, color: "var(--fg-2)", marginBottom: 0 }}>
          Alterar o fim para hoje ou depois reativa a oferta; antes de hoje, ela fica vencida.
          “Encerrar oferta” tira da lista de sugestões agora.
        </p>
      </Card>
      <Card padding={0} style={{ overflowX: "auto", marginTop: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--fg-2)" }}>
              {["Código", "Item do encarte", "Produto vinculado", "Preço", "Tipo"].map((h) => (
                <th key={h} style={{ padding: "12px 16px", fontWeight: 500 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(({ item, product }) => (
              <tr key={item.id} style={{ borderTop: "1px solid var(--border-1)" }}>
                <td className="tabular" style={{ padding: "10px 16px" }}>
                  {item.rawCode ?? "sem código"}
                </td>
                <td style={{ padding: "10px 16px" }}>{item.rawDescription}</td>
                <td style={{ padding: "10px 16px" }}>
                  {product ? titleCase(product.description) : "sem vínculo"}
                </td>
                <td className="tabular" style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                  {formatCents(item.priceCents)}/{UNIT[item.priceUnit] ?? item.priceUnit}
                  {item.minQty ? ` a partir de ${Number(item.minQty)}` : ""}
                </td>
                <td style={{ padding: "10px 16px" }}>{TYPE[item.priceType] ?? item.priceType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p style={{ fontSize: 13 }}>
        <Link href="/ofertas">Voltar para ofertas</Link>
      </p>
    </>
  );
}
