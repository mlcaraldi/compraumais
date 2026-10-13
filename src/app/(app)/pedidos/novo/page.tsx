import { Button } from "@/components/core/Button";
import { Card } from "@/components/core/Card";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { customersRepo } from "@/server/repos";
import { createTypedOrderAction } from "../actions";

export const dynamic = "force-dynamic";
const ROWS = 12;

const field = {
  height: 40,
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface-card)",
  padding: "0 8px",
  fontFamily: "inherit",
  fontSize: 14,
  width: "100%",
} as const;

export default async function NovoPedidoPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const { rows: customers } = await customersRepo.listCustomers(getDb(), user.tenantId, {
    limit: 1000,
  });
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return (
    <>
      <PageHeader
        title="Digitar pedido"
        subtitle="Mesmo resultado de subir o PDF, sem ler com IA. Linhas com código novo precisam de descrição."
      />
      {sp.erro && (
        <Card tone="dashed" style={{ marginBottom: 16, color: "var(--fg-accent)" }}>
          {sp.erro}
        </Card>
      )}
      <form action={createTypedOrderAction}>
        <Card style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "2fr 1fr 1fr" }}>
            <label style={{ display: "grid", gap: 4, fontSize: 14, fontWeight: 600 }}>
              Cliente
              <input
                name="customer"
                list="clientes"
                required
                placeholder="Código ou nome do cliente"
                style={field}
              />
              <datalist id="clientes">
                {customers.map((c) => (
                  <option key={c.id} value={`${c.externalCode} | ${c.tradeName ?? c.legalName}`} />
                ))}
              </datalist>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 14, fontWeight: 600 }}>
              Data
              <input type="date" name="issuedAt" defaultValue={today} required style={field} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 14, fontWeight: 600 }}>
              Número (opcional)
              <input name="orderNumber" placeholder="gerado se vazio" style={field} />
            </label>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--fg-2)" }}>
                {[
                  "Código",
                  "Quantidade",
                  "Preço unitário (R$)",
                  "Descrição (se o código for novo)",
                ].map((h) => (
                  <th key={h} style={{ padding: "4px 8px 8px 0", fontWeight: 500 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: ROWS }, (_, i) => (
                <tr key={i}>
                  <td style={{ paddingRight: 8, paddingBottom: 6, width: 140 }}>
                    <input name={`code_${i}`} aria-label={`Código ${i + 1}`} style={field} />
                  </td>
                  <td style={{ paddingRight: 8, paddingBottom: 6, width: 120 }}>
                    <input
                      name={`qty_${i}`}
                      inputMode="decimal"
                      aria-label={`Quantidade ${i + 1}`}
                      style={field}
                    />
                  </td>
                  <td style={{ paddingRight: 8, paddingBottom: 6, width: 160 }}>
                    <input
                      name={`price_${i}`}
                      inputMode="decimal"
                      aria-label={`Preço ${i + 1}`}
                      style={field}
                    />
                  </td>
                  <td style={{ paddingBottom: 6 }}>
                    <input name={`desc_${i}`} aria-label={`Descrição ${i + 1}`} style={field} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <Button type="submit">Criar pedido</Button>
          </div>
        </Card>
      </form>
    </>
  );
}
