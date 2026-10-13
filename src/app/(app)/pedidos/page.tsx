import Link from "next/link";
import { Badge } from "@/components/core/Badge";
import { Button } from "@/components/core/Button";
import { Card } from "@/components/core/Card";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { formatCents } from "@/server/normalize";
import { ordersRepo } from "@/server/repos";
import { RESULT_LABEL } from "./labels";
import { UploadOrderForm } from "./upload-form";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const { rows, total } = await ordersRepo.listOrders(getDb(), user.tenantId, {
    q: sp.q,
    offset: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
  });
  return (
    <>
      <PageHeader
        title="Pedidos"
        subtitle="Suba o pedido do cliente (PDF ou imagem) ou digite as linhas. As sugestões saem do pedido confirmado."
        actions={
          <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
            <UploadOrderForm />
            <Link href="/pedidos/novo">
              <Button variant="secondary" size="sm">
                Digitar pedido
              </Button>
            </Link>
          </div>
        }
      />
      <form method="get" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          name="q"
          defaultValue={sp.q}
          placeholder="Buscar por número ou cliente"
          aria-label="Buscar pedido"
          style={{
            height: 40,
            minWidth: 280,
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-strong)",
            background: "var(--surface-card)",
            padding: "0 8px",
            fontFamily: "inherit",
            fontSize: 14,
          }}
        />
        <Button type="submit" size="sm" variant="secondary">
          Buscar
        </Button>
      </form>
      <Card padding={0} style={{ overflowX: "auto" }}>
        {rows.length === 0 ? (
          <p style={{ padding: 24, margin: 0, color: "var(--fg-2)" }}>Nenhum pedido ainda.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--fg-2)" }}>
                {["Pedido", "Cliente", "Data", "Total", "Sugestões", "Resultado"].map((h) => (
                  <th key={h} style={{ padding: "12px 16px", fontWeight: 500 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ order, customer, suggestionCount, result }) => (
                <tr key={order.id} style={{ borderTop: "1px solid var(--border-1)" }}>
                  <td className="tabular" style={{ padding: "12px 16px" }}>
                    <Link
                      href={`/pedidos/${order.id}`}
                      style={{ color: "var(--fg-accent)", fontWeight: 600 }}
                    >
                      {order.externalNumber}
                    </Link>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {customer.tradeName ?? customer.legalName}
                  </td>
                  <td className="tabular" style={{ padding: "12px 16px" }}>
                    {order.issuedAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </td>
                  <td className="tabular" style={{ padding: "12px 16px" }}>
                    {order.totalCents === null ? "" : formatCents(order.totalCents)}
                  </td>
                  <td className="tabular" style={{ padding: "12px 16px" }}>
                    {suggestionCount}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {result ? (
                      <Badge tone={result === "accepted" ? "success-soft" : "outline"}>
                        {RESULT_LABEL[result] ?? result}
                      </Badge>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Pagination
        page={page}
        pages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        basePath="/pedidos"
        params={{ q: sp.q }}
      />
    </>
  );
}
