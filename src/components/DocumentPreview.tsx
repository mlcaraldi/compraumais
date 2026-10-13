/** Mostra o documento original ao lado da revisão: imagem ampliável ou PDF embutido. */
export function DocumentPreview({
  sha,
  mime,
  filename,
}: {
  sha: string;
  mime: string;
  filename: string;
}) {
  const src = `/api/files/${sha}`;
  if (mime.startsWith("image/"))
    return (
      <a href={src} target="_blank" rel="noreferrer" title="Abrir em tamanho real">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={filename}
          style={{ width: "100%", height: "auto", borderRadius: "var(--radius-md)" }}
        />
      </a>
    );
  if (mime === "application/pdf")
    return (
      <iframe
        src={src}
        title={filename}
        style={{
          width: "100%",
          height: 560,
          border: "1px solid var(--border-1)",
          borderRadius: "var(--radius-md)",
        }}
      />
    );
  return (
    <a href={src} style={{ color: "var(--fg-accent)", fontWeight: 600 }}>
      Baixar {filename}
    </a>
  );
}
