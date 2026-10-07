import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import Papa from "papaparse";
import type { Db } from "./client";
import { segmentAliases, segments } from "./schema";
import { normalizeText } from "../normalize/text";

const SEGMENT_NAMES: Record<string, string> = {
  restaurante: "Restaurante",
  refeicoes_coletivas: "Refeições coletivas",
  lanches: "Lanches",
  pizzaria: "Pizzaria",
  panificacao: "Panificação",
  bar_cafeteria: "Bar e cafeteria",
  sorveteria: "Sorveteria",
  revenda: "Revenda",
  industria: "Indústria",
  outros: "Outros",
  sem_ramo: "Sem ramo",
};

/** Usa data/real/segmentos_ramo.csv quando existir; senão a cópia em tests/fixtures. */
export function loadSegmentsCsv(): string {
  const real = path.join(process.env.REAL_DATA_DIR ?? "./data/real", "segmentos_ramo.csv");
  const file = existsSync(real) ? real : path.join("tests", "fixtures", "segmentos_ramo.csv");
  return readFileSync(file, "utf8");
}

export async function seedSegments(db: Db, tenantId: string, csvText: string) {
  const rows = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  }).data;

  const codes = new Map<string, boolean>();
  for (const r of rows) {
    const code = r.segmento?.trim();
    if (code) codes.set(code, codes.get(code) === true || r.tem_receitas_v1?.trim() === "sim");
  }
  for (const [code, hasRecipes] of codes) {
    await db
      .insert(segments)
      .values({ tenantId, code, name: SEGMENT_NAMES[code] ?? code, hasRecipes })
      .onConflictDoNothing();
  }
  const all = await db.select().from(segments).where(eq(segments.tenantId, tenantId));
  const idByCode = new Map(all.map((s) => [s.code, s.id]));

  for (const r of rows) {
    const raw = normalizeText(r.ramo_atividade);
    const segmentId = idByCode.get(r.segmento?.trim() ?? "");
    // Ramo em branco não vira alias: o importador usa o segmento "sem_ramo" direto.
    if (!raw || !segmentId) continue;
    await db
      .insert(segmentAliases)
      .values({ tenantId, rawValue: raw, segmentId })
      .onConflictDoNothing();
  }
}
