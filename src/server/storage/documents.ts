import { createHash } from "node:crypto";
import sharp from "sharp";
import type { Db } from "../db/client";
import { findDocumentBySha, insertDocument } from "../repos/documents";
import { getBlob, putBlob } from "./blobs";

export type DocumentKind = "customers" | "products" | "recipes" | "order" | "promotion";

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function mimeFromFilename(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "csv":
      return "text/csv";
    case "pdf":
      return "application/pdf";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

/** Grava o arquivo (deduplicado por SHA-256 dentro do tenant) e gera miniatura para imagens. */
export async function saveDocument(
  db: Db,
  tenantId: string,
  input: { buffer: Buffer; filename: string; kind: DocumentKind; userId?: string; mime?: string },
) {
  if (!tenantId) throw new Error("tenantId é obrigatório");
  const hash = sha256(input.buffer);
  const existing = await findDocumentBySha(db, tenantId, hash);
  if (existing) return { document: existing, created: false };

  const mime = input.mime && input.mime !== "application/octet-stream" ? input.mime : mimeFromFilename(input.filename);
  await putBlob(db, tenantId, hash, input.buffer);
  if (mime.startsWith("image/")) {
    const thumb = await sharp(input.buffer)
      .rotate()
      .resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
    await putBlob(db, tenantId, `${hash}.thumb`, thumb);
  }
  const document = await insertDocument(db, tenantId, {
    sha256: hash,
    filename: input.filename,
    mime,
    sizeBytes: input.buffer.length,
    kind: input.kind,
    uploadedBy: input.userId ?? null,
  });
  return { document, created: true };
}

export async function readDocument(db: Db, tenantId: string, hash: string, thumb = false) {
  const doc = await findDocumentBySha(db, tenantId, hash);
  if (!doc) return null;
  const data = await getBlob(db, tenantId, thumb ? `${hash}.thumb` : hash);
  return data ? { document: doc, data } : null;
}
