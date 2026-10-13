import Link from "next/link";

export function Pagination({
  page,
  pages,
  params,
  basePath,
}: {
  page: number;
  pages: number;
  params: Record<string, string | undefined>;
  basePath: string;
}) {
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, page: String(p) })) if (v) sp.set(k, v);
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 16,
        fontSize: 14,
      }}
    >
      {page > 1 ? <Link href={href(page - 1)}>← Anterior</Link> : <span />}
      <span style={{ color: "var(--fg-2)" }}>
        Página {page} de {pages}
      </span>
      {page < pages ? <Link href={href(page + 1)}>Próxima →</Link> : <span />}
    </div>
  );
}
