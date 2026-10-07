import Link from "next/link";
import { Badge } from "@/components/core/Badge";
import { Button } from "@/components/core/Button";
import { Card } from "@/components/core/Card";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { formatCents } from "@/server/normalize";
import { productsRepo } from "@/server/repos";
import { UploadProductsForm } from "./upload-form";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;
const SOURCE_LABEL: Record<string, string> = {
  catalog: "catálogo",
  order: "pedido",
  promotion: "encarte",
  manual: "manual",
};

type SP = { q?: string; origem?: string; vendavel?: string; page?: string };

const field = {
  height: 40,
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface-card)",
  padding: "0 8px",
  fontFamily: "inherit",
  fontSize: 14,
} as const;

export default async function ProdutosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const { rows, total } = await productsRepo.listProducts(getDb(), user.tenantId, {
    q: sp.q,
    source: sp.origem || undefined,
    sellable: sp.vendavel === "sim" ? true : sp.vendavel === "nao" ? false : undefined,
    offset: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <>
      <PageHeader
        title="Produtos"
        subtitle={`${total} produtos. Eles entram pelo catálogo, pelos pedidos e pelos encartes.`}
        actions={<UploadProductsForm />}
      />
      <form method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <input
          name="q"
          defaultValue={sp.q}
          placeholder="Buscar por código, descrição ou marca"
          aria-label="Buscar"
          style={{ ...field, minWidth: 280 }}
        />
        <select name="origem" defaultValue={sp.origem ?? ""} aria-label="Origem" style={field}>
          <option value="">Todas as origens</option>
          {Object.entries(SOURCE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select
          name="vendavel"
          defaultValue={sp.vendavel ?? ""}
          aria-label="Vendável"
          style={field}
        >
          <option value="">Vendáveis ou não</option>
          <option value="sim">Só vendáveis</option>
          <option value="nao">Só não vendáveis</option>
        </select>
        <Button type="submit" size="sm" variant="secondary">
          Filtrar
        </Button>
        <Link
          href="/produtos"
          style={{ fontSize: 14, color: "var(--fg-accent)", alignSelf: "center" }}
        >
          Limpar
        </Link>
      </form>
      <Card padding={0} style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--fg-2)" }}>
              {["Código", "Descrição", "Embalagem", "Preço de lista", "Origem"].map((h) => (
                <th key={h} style={{ padding: "12px 16px", fontWeight: 500 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} style={{ borderTop: "1px solid var(--border-1)" }}>
                <td className="tabular" style={{ padding: "10px 16px" }}>
                  {p.code}
                </td>
                <td style={{ padding: "10px 16px" }}>
                  <Link
                    href={`/produtos/${p.id}`}
                    style={{ color: "var(--fg-accent)", fontWeight: 600 }}
                  >
                    {p.description}
                  </Link>{" "}
                  {!p.sellable && <Badge tone="outline">não vendável</Badge>}
                  <div style={{ color: "var(--fg-2)", fontSize: 12 }}>{p.brand}</div>
                </td>
                <td className="tabular" style={{ padding: "10px 16px" }}>
                  {p.packText ??
                    (p.packUnitSize ? `${p.packQty} × ${p.packUnitSize} ${p.packUnit}` : "")}
                </td>
                <td className="tabular" style={{ padding: "10px 16px" }}>
                  {p.listPriceCents === null ? "" : formatCents(p.listPriceCents)}
                  {p.saleUnit && <span style={{ color: "var(--fg-2)" }}> /{p.saleUnit}</span>}
                </td>
                <td style={{ padding: "10px 16px", color: "var(--fg-2)" }}>
                  {SOURCE_LABEL[p.source] ?? p.source}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 24, color: "var(--fg-2)" }}>
                  Nenhum produto ainda. Importe um catálogo, um pedido ou um encarte.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination
          page={page}
          pages={pages}
          basePath="/produtos"
          params={{ ...sp, page: undefined }}
        />
      </Card>
    </>
  );
}
