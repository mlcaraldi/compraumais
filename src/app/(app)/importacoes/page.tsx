import Link from "next/link";
import { Badge } from "@/components/core/Badge";
import { Card } from "@/components/core/Card";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { importsRepo } from "@/server/repos";
import { KIND_LABEL, STATUS_LABEL } from "./labels";

export const dynamic = "force-dynamic";

const TONE = { done: "success-soft", failed: "brasa", review: "neutral" } as const;

export default async function ImportacoesPage() {
  const user = await requireUser();
  const jobs = await importsRepo.listImportJobs(getDb(), user.tenantId);
  return (
    <>
      <PageHeader
        title="Importações"
        subtitle="Cada arquivo importado passa por revisão antes de entrar no sistema."
      />
      <Card padding={0}>
        {jobs.length === 0 ? (
          <p style={{ padding: 24, color: "var(--fg-2)", margin: 0 }}>Nenhuma importação ainda.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--fg-2)" }}>
                {["Arquivo", "Tipo", "Linhas", "Situação", "Data"].map((h) => (
                  <th key={h} style={{ padding: "12px 16px", fontWeight: 500 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map(({ job, filename, rowCount }) => (
                <tr key={job.id} style={{ borderTop: "1px solid var(--border-1)" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <Link
                      href={`/importacoes/${job.id}`}
                      style={{ color: "var(--fg-accent)", fontWeight: 600 }}
                    >
                      {filename}
                    </Link>
                  </td>
                  <td style={{ padding: "12px 16px" }}>{KIND_LABEL[job.kind] ?? job.kind}</td>
                  <td className="tabular" style={{ padding: "12px 16px" }}>
                    {rowCount}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <Badge tone={TONE[job.status as keyof typeof TONE] ?? "outline"}>
                      {STATUS_LABEL[job.status] ?? job.status}
                    </Badge>
                  </td>
                  <td className="tabular" style={{ padding: "12px 16px", color: "var(--fg-2)" }}>
                    {job.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
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
