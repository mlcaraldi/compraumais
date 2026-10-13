import Link from "next/link";
import { Button } from "@/components/core/Button";
import { Card } from "@/components/core/Card";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { formatCents, titleCase } from "@/server/normalize";
import { getDashboard, resolvePeriod } from "@/server/services/dashboard";

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

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <div
        style={{
          fontSize: 12,
          color: "var(--fg-2)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}
      >
        {label}
      </div>
      <div
        className="tabular"
        data-testid={`metric-${label}`}
        style={{ fontSize: 32, fontFamily: "var(--cm-font-display)", fontWeight: 600 }}
      >
        {value}
      </div>
      {hint && <div style={{ fontSize: 13, color: "var(--fg-2)" }}>{hint}</div>}
    </Card>
  );
}

export default async function PainelPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const period = resolvePeriod(sp.from, sp.to);
  const d = await getDashboard(getDb(), user.tenantId, period);
  const qs = `from=${period.from}&to=${period.to}`;
  return (
    <>
      <PageHeader
        title="Painel"
        subtitle="Resultado das sugestões nos pedidos emitidos no período."
        actions={
          <a href={`/painel/export?${qs}`}>
            <Button variant="secondary" size="sm">
              Exportar CSV
            </Button>
          </a>
        }
      />
      <form method="get" style={{ display: "flex", gap: 8, alignItems: "end", marginBottom: 16 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 14, fontWeight: 600 }}>
          De
          <input type="date" name="from" defaultValue={period.from} style={field} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 14, fontWeight: 600 }}>
          Até
          <input type="date" name="to" defaultValue={period.to} style={field} />
        </label>
        <Button type="submit" size="sm">
          Filtrar
        </Button>
      </form>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 16,
        }}
      >
        <Metric label="Pedidos processados" value={String(d.processed)} />
        <Metric label="Pedidos com sugestão" value={String(d.withSuggestion)} />
        <Metric label="Mensagens enviadas" value={String(d.sent)} />
        <Metric label="Aceites" value={String(d.accepted)} hint="Aceitou ou aceitou parte" />
        <Metric
          label="Taxa de aceite"
          value={d.acceptRate === null ? "sem envios" : `${Math.round(d.acceptRate * 100)}%`}
          hint="Aceites sobre mensagens enviadas"
        />
        <Metric
          label="Valor aceito declarado"
          value={formatCents(d.acceptedValueCents)}
          hint="1 unidade de cada item aceito"
        />
        <Metric
          label="Itens novos no mix"
          value={String(d.newToMix)}
          hint="Cliente nunca tinha comprado"
        />
      </div>
      <Card style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: "var(--text-h3)", margin: "0 0 8px" }}>Ofertas mais aceitas</h2>
        {d.topOffers.length === 0 ? (
          <p style={{ margin: 0, color: "var(--fg-2)", fontSize: 14 }}>
            Nenhuma oferta aceita no período.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--fg-2)" }}>
                <th style={{ padding: "6px 0", fontWeight: 500 }}>Produto</th>
                <th style={{ fontWeight: 500 }}>Sugerida</th>
                <th style={{ fontWeight: 500 }}>Aceita</th>
              </tr>
            </thead>
            <tbody>
              {d.topOffers.map((o) => (
                <tr key={o.productId} style={{ borderTop: "1px solid var(--border-1)" }}>
                  <td style={{ padding: "8px 0" }}>{titleCase(o.description)}</td>
                  <td className="tabular">{o.suggested}</td>
                  <td className="tabular">{o.accepted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <p style={{ fontSize: 13, color: "var(--fg-2)" }}>
        Ver pedidos em <Link href="/pedidos">Pedidos</Link>.
      </p>
    </>
  );
}
