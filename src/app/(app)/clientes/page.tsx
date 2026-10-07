import Link from "next/link";
import { Badge } from "@/components/core/Badge";
import { Button } from "@/components/core/Button";
import { Card } from "@/components/core/Card";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { customersRepo, segmentsRepo } from "@/server/repos";
import { UploadCustomersForm } from "./upload-form";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

type SP = {
  q?: string;
  segmento?: string;
  cidade?: string;
  bloqueado?: string;
  telefone?: string;
  page?: string;
};

const selectStyle = {
  height: 40,
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface-card)",
  padding: "0 8px",
  fontFamily: "inherit",
  fontSize: 14,
} as const;

export default async function ClientesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const db = getDb();
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const [{ rows, total }, segments, cities] = await Promise.all([
    customersRepo.listCustomers(db, user.tenantId, {
      q: sp.q,
      segmentId: sp.segmento || undefined,
      city: sp.cidade || undefined,
      blocked: sp.bloqueado === "sim" ? true : sp.bloqueado === "nao" ? false : undefined,
      phoneKind: sp.telefone || undefined,
      offset: (page - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
    }),
    segmentsRepo.listSegments(db, user.tenantId),
    customersRepo.listCities(db, user.tenantId),
  ]);
  const segName = new Map(segments.map((s) => [s.id, s.name]));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle={`${total} clientes`}
        actions={<UploadCustomersForm />}
      />
      <form
        method="get"
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 16,
          alignItems: "center",
        }}
      >
        <input
          name="q"
          defaultValue={sp.q}
          placeholder="Buscar por nome, código ou cidade"
          aria-label="Buscar"
          style={{ ...selectStyle, minWidth: 260 }}
        />
        <select
          name="segmento"
          defaultValue={sp.segmento ?? ""}
          aria-label="Segmento"
          style={selectStyle}
        >
          <option value="">Todos os segmentos</option>
          {segments.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          name="cidade"
          defaultValue={sp.cidade ?? ""}
          aria-label="Cidade"
          style={selectStyle}
        >
          <option value="">Todas as cidades</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          name="bloqueado"
          defaultValue={sp.bloqueado ?? ""}
          aria-label="Bloqueio"
          style={selectStyle}
        >
          <option value="">Bloqueados ou não</option>
          <option value="sim">Só bloqueados</option>
          <option value="nao">Só liberados</option>
        </select>
        <select
          name="telefone"
          defaultValue={sp.telefone ?? ""}
          aria-label="Telefone"
          style={selectStyle}
        >
          <option value="">Qualquer telefone</option>
          <option value="mobile">Celular</option>
          <option value="landline">Fixo</option>
          <option value="invalid">Inválido</option>
        </select>
        <Button type="submit" size="sm" variant="secondary">
          Filtrar
        </Button>
        <Link href="/clientes" style={{ fontSize: 14, color: "var(--fg-accent)" }}>
          Limpar
        </Link>
      </form>
      <Card padding={0} style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--fg-2)" }}>
              {["Código", "Cliente", "Segmento", "Cidade", "Telefone", "Última compra"].map((h) => (
                <th key={h} style={{ padding: "12px 16px", fontWeight: 500 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} style={{ borderTop: "1px solid var(--border-1)" }}>
                <td className="tabular" style={{ padding: "10px 16px" }}>
                  {c.externalCode}
                </td>
                <td style={{ padding: "10px 16px" }}>
                  <Link
                    href={`/clientes/${c.id}`}
                    style={{ color: "var(--fg-accent)", fontWeight: 600 }}
                  >
                    {c.tradeName ?? c.legalName}
                  </Link>{" "}
                  {c.blocked && <Badge tone="outline">bloqueado</Badge>}
                </td>
                <td style={{ padding: "10px 16px" }}>
                  {c.segmentId ? segName.get(c.segmentId) : ""}
                </td>
                <td style={{ padding: "10px 16px" }}>{c.city}</td>
                <td className="tabular" style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                  {c.phoneE164 ?? c.phoneRaw ?? ""}
                  {c.phoneKind && c.phoneKind !== "mobile" && (
                    <span style={{ color: "var(--fg-2)" }}>
                      {c.phoneKind === "landline" ? " · fixo" : " · inválido"}
                    </span>
                  )}
                </td>
                <td className="tabular" style={{ padding: "10px 16px", color: "var(--fg-2)" }}>
                  {c.lastPurchaseAt ? c.lastPurchaseAt.split("-").reverse().join("/") : ""}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 24, color: "var(--fg-2)" }}>
                  Nenhum cliente encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination
          page={page}
          pages={pages}
          basePath="/clientes"
          params={{ ...sp, page: undefined }}
        />
      </Card>
    </>
  );
}
