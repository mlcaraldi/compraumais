import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Db } from "../db/client";
import { getBlobRow, putBlobRow } from "../repos/documents";

/** Onde os bytes ficam: disco (padrão, local e testes) ou Postgres (homologação serverless). */
export function storageDriver(): "disk" | "db" {
  return process.env.STORAGE_DRIVER === "db" ? "db" : "disk";
}

function diskPath(tenantId: string, key: string) {
  return path.join(process.env.STORAGE_DIR ?? "./storage", tenantId, key);
}

export async function putBlob(db: Db, tenantId: string, key: string, data: Buffer) {
  if (storageDriver() === "db") return putBlobRow(db, tenantId, key, data);
  const file = diskPath(tenantId, key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
}

export async function getBlob(db: Db, tenantId: string, key: string): Promise<Buffer | null> {
  if (storageDriver() === "db") return getBlobRow(db, tenantId, key);
  try {
    return await readFile(diskPath(tenantId, key));
  } catch {
    return null;
  }
}
