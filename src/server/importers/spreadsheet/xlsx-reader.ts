import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";

export type Cell = string | number | boolean | null;
export type Sheet = { name: string; rows: Cell[][] };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: false,
  processEntities: true,
  isArray: (name) => ["row", "c", "si", "r", "sheet", "Relationship"].includes(name),
});

type Node = Record<string, unknown>;

function text(node: unknown): string {
  if (node === undefined || node === null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "boolean") return String(node);
  const n = node as Node;
  if (Array.isArray(n.r)) return (n.r as Node[]).map((r) => text(r.t)).join("");
  return text(n.t) || text(n["#text"]);
}

function colIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function readXml(files: Record<string, Uint8Array>, path: string): Node | null {
  const normalized = path.replace(/^\//, "");
  const data = files[normalized];
  if (!data) return null;
  return parser.parse(strFromU8(data).replace(/^﻿/, "")) as Node;
}

/**
 * Leitor mínimo de XLSX. Não usa exceljs/SheetJS porque a exportação do ERP usa
 * prefixo de namespace (`x:`), links absolutos e strings inline, o que as
 * bibliotecas comuns não leem (ver docs/decisoes.md).
 */
export function readXlsx(buffer: Uint8Array): Sheet[] {
  const files = unzipSync(buffer);

  const sharedXml = readXml(files, "xl/sharedStrings.xml");
  const shared: string[] = [];
  const sst = (sharedXml?.sst ?? {}) as Node;
  for (const si of (sst.si as Node[] | undefined) ?? []) shared.push(text(si));

  const wb = readXml(files, "xl/workbook.xml");
  const rels = readXml(files, "xl/_rels/workbook.xml.rels");
  const relTarget = new Map<string, string>();
  const relList =
    ((rels?.Relationships as Node | undefined)?.Relationship as Node[] | undefined) ?? [];
  for (const r of relList) {
    let target = String(r["@_Target"] ?? "");
    if (!target.startsWith("/")) target = `xl/${target}`;
    relTarget.set(String(r["@_Id"]), target);
  }

  const sheetNodes =
    (((wb?.workbook as Node | undefined)?.sheets as Node | undefined)?.sheet as
      Node[] | undefined) ?? [];
  const sheets: Sheet[] = [];
  sheetNodes.forEach((s, i) => {
    const rid = String(s["@_id"] ?? "");
    const path = relTarget.get(rid) ?? `xl/worksheets/sheet${i + 1}.xml`;
    const ws = readXml(files, path);
    if (!ws) return;
    const data = ((ws.worksheet as Node | undefined)?.sheetData ?? {}) as Node;
    const rows: Cell[][] = [];
    let seq = 0;
    for (const row of (data.row as Node[] | undefined) ?? []) {
      const rIdx = row["@_r"] ? Number(row["@_r"]) - 1 : seq;
      seq = rIdx + 1;
      const cells: Cell[] = [];
      let lastCol = -1;
      for (const c of (row.c as Node[] | undefined) ?? []) {
        const col = c["@_r"] ? colIndex(String(c["@_r"])) : lastCol + 1;
        lastCol = col;
        const t = c["@_t"];
        let value: Cell = null;
        if (t === "inlineStr") value = text(c.is);
        else if (t === "s") value = shared[Number(c.v)] ?? null;
        else if (t === "str") value = text(c.v);
        else if (t === "b") value = text(c.v) === "1";
        else if (t === "e") value = null;
        else if (c.v !== undefined && text(c.v) !== "") {
          const n = Number(text(c.v));
          value = Number.isFinite(n) ? n : text(c.v);
        }
        while (cells.length < col) cells.push(null);
        cells[col] = value;
      }
      while (rows.length < rIdx) rows.push([]);
      rows[rIdx] = cells;
    }
    sheets.push({ name: String(s["@_name"] ?? `Planilha${i + 1}`), rows });
  });
  return sheets;
}
