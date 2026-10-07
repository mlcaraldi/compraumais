import Papa from "papaparse";
import { readXlsx, type Cell } from "./xlsx-reader";

/** Lê XLSX ou CSV e devolve a primeira planilha como matriz de células. */
export function readTable(buffer: Buffer, filename: string): Cell[][] {
  if (filename.toLowerCase().endsWith(".csv")) {
    const text = buffer.toString("utf8").replace(/^﻿/, "");
    const first = text.split(/\r?\n/, 1)[0] ?? "";
    const delimiter =
      (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
    return Papa.parse<string[]>(text, { delimiter, skipEmptyLines: true }).data;
  }
  const sheets = readXlsx(buffer);
  if (!sheets[0]) throw new Error("A planilha não tem nenhuma aba.");
  return sheets[0].rows;
}

export function cellToString(cell: Cell | undefined): string | null {
  if (cell === null || cell === undefined) return null;
  const s = typeof cell === "number" ? String(cell) : String(cell).trim();
  return s === "" ? null : s;
}

/** Chave de cabeçalho: sem acento, sem pontuação ("Dt. Últ. Compra" -> "DTULTCOMPRA"). */
export function headerKey(h: Cell | undefined): string {
  return String(h ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}
