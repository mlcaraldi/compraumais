import { Badge } from "@/components/core/Badge";
import { Card } from "@/components/core/Card";
import { PageHeader } from "@/components/PageHeader";
import Link from "next/link";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { formatIsoBr, todayIso } from "@/server/normalize";
import { promotionsRepo } from "@/server/repos";
import { UploadPromotionsForm } from "./upload-form";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { active: "Ativa", expired: "Vencida", draft: "Rascunho" };

export default async function OfertasPage() {
  const user = await requireUser();
  // onde não há worker (homologação), o vencimento é aplicado ao abrir a lista
  await promotionsRepo.expireOverdue(getDb(), user.tenantId, todayIso(new Date()));
  const rows = await promotionsRepo.listPromotions(getDb(), user.tenantId);
  return (
    <>
      <PageHeader
        title="Ofertas"
        subtitle="Encartes com vigência. Só ofertas dentro da vigência entram nas sugestões."
        actions={<UploadPromotionsForm />}
      />
      <Card padding={0} style={{ overflowX: "auto" }}>
        {rows.length === 0 ? (
          <p style={{ padding: 24, margin: 0, color: "var(--fg-2)" }}>Nenhum encarte ainda.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--fg-2)" }}>
                {["Encarte", "Marca", "Início", "Fim", "Itens", "Situação"].map((h) => (
                  <th key={h} style={{ padding: "12px 16px", fontWeight: 500 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ promotion: p, itemCount }) => (
                <tr key={p.id} style={{ borderTop: "1px solid var(--border-1)" }}>
                  <td style={{ padding: "12px 16px", fontWeight: 600 }}>
                    <Link href={`/ofertas/${p.id}`} style={{ color: "var(--fg-accent)" }}>
                      {p.name}
                    </Link>
                  </td>
                  <td style={{ padding: "12px 16px" }}>{p.supplierBrand}</td>
                  <td className="tabular" style={{ padding: "12px 16px" }}>
                    {formatIsoBr(p.startsOn)}
                  </td>
                  <td className="tabular" style={{ padding: "12px 16px" }}>
                    {formatIsoBr(p.endsOn)}
                  </td>
                  <td className="tabular" style={{ padding: "12px 16px" }}>
                    {itemCount}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <Badge tone={p.status === "active" ? "success-soft" : "outline"}>
                      {STATUS[p.status] ?? p.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
