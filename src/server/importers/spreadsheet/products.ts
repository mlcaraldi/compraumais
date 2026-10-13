import { normalizeText, parseMoneyCents, parsePack, parseProductCode } from "../../normalize";
import { block, warn, type RowWarning } from "../types";
import type { Cell } from "./xlsx-reader";
import { cellToString, headerKey } from "./table";

export const PRODUCT_FIELDS = [
  "code",
  "description",
  "brand",
  "packText",
  "saleUnit",
  "price",
  "category",
] as const;
export type ProductField = (typeof PRODUCT_FIELDS)[number];
export type ProductMapping = Partial<Record<ProductField, number>>;

export const PRODUCT_FIELD_LABELS: Record<ProductField, string> = {
  code: "Código",
  description: "Descrição",
  brand: "Marca",
  packText: "Embalagem",
  saleUnit: "Unidade de venda",
  price: "Preço de lista",
  category: "Categoria",
};
export const REQUIRED_PRODUCT_FIELDS: ProductField[] = ["code", "description"];

const HEADER_ALIASES: Record<string, ProductField> = {
  CODIGO: "code",
  COD: "code",
  CODIGOPRODUTO: "code",
  CODPRODUTO: "code",
  SKU: "code",
  DESCRICAO: "description",
  DESCRICAOPRODUTO: "description",
  PRODUTO: "description",
  NOME: "description",
  MARCA: "brand",
  FABRICANTE: "brand",
  EMBALAGEM: "packText",
  UNIDADE: "saleUnit",
  UN: "saleUnit",
  UNIDADEVENDA: "saleUnit",
  PRECO: "price",
  PRECOLISTA: "price",
  VALOR: "price",
  CATEGORIA: "category",
  GRUPO: "category",
  DEPARTAMENTO: "category",
};

export function detectProductMapping(headers: Cell[]): ProductMapping {
  const mapping: ProductMapping = {};
  headers.forEach((h, i) => {
    const field = HEADER_ALIASES[headerKey(h)];
    if (field && mapping[field] === undefined) mapping[field] = i;
  });
  return mapping;
}

export type ParsedProduct = {
  code: string;
  description: string;
  brand: string | null;
  packText: string | null;
  packQty: string | null;
  packUnitSize: string | null;
  packUnit: "g" | "ml" | "un" | null;
  saleUnit: "un" | "pct" | "kg" | "cx" | null;
  listPriceCents: number | null;
  category: string | null;
  searchText: string;
};

export function normalizeSaleUnit(raw: string | null): ParsedProduct["saleUnit"] {
  const k = normalizeText(raw).replace(/[^A-Z]/g, "");
  if (["UN", "UND", "UNID", "UNIDADE"].includes(k)) return "un";
  if (["PCT", "PC", "PACOTE"].includes(k)) return "pct";
  if (["KG", "QUILO", "KILO"].includes(k)) return "kg";
  if (["CX", "CAIXA"].includes(k)) return "cx";
  return null;
}

export function buildProductSearchText(p: {
  code: string;
  description: string;
  brand: string | null;
}) {
  return normalizeText(`${p.code} ${p.description} ${p.brand ?? ""}`);
}

export function parseProductRows(rows: Cell[][], mapping: ProductMapping, headerRow = 0) {
  const out: { rowNumber: number; data: ParsedProduct; warnings: RowWarning[] }[] = [];
  let skipped = 0;
  const get = (row: Cell[], f: ProductField) =>
    mapping[f] === undefined ? undefined : row[mapping[f]!];

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const codeRaw = cellToString(get(row, "code"));
    const description = cellToString(get(row, "description"));
    if (!codeRaw && !description) {
      if (row.some((c) => cellToString(c))) skipped++;
      continue;
    }
    const warnings: RowWarning[] = [];
    const parsedCode = parseProductCode(codeRaw);
    if (!parsedCode.code || parsedCode.ambiguous) {
      warnings.push(
        block(
          "codigo_invalido",
          `Código "${codeRaw ?? ""}" inválido ou ambíguo (precisa ter 4 a 7 dígitos)`,
        ),
      );
    }
    if (!description) warnings.push(block("sem_descricao", "Produto sem descrição"));

    const packText = cellToString(get(row, "packText"));
    const pack = parsePack(packText) ?? parsePack(description);
    const saleUnitRaw = cellToString(get(row, "saleUnit"));
    const saleUnit = normalizeSaleUnit(saleUnitRaw);
    if (saleUnitRaw && !saleUnit)
      warnings.push(warn("unidade_desconhecida", `Unidade "${saleUnitRaw}" não reconhecida`));
    const priceRaw = get(row, "price");
    const listPriceCents = parseMoneyCents(priceRaw as string | number | null | undefined);
    if (cellToString(priceRaw) && listPriceCents === null)
      warnings.push(warn("preco_invalido", "Preço não reconhecido"));

    const code = parsedCode.code ?? codeRaw ?? "";
    const brand = cellToString(get(row, "brand"));
    out.push({
      rowNumber: i + 1,
      warnings,
      data: {
        code,
        description: description ?? "",
        brand,
        packText: packText ?? null,
        packQty: pack ? String(pack.qty) : null,
        packUnitSize: pack?.unitSize ? String(pack.unitSize) : null,
        packUnit: pack?.unit ?? null,
        saleUnit,
        listPriceCents,
        category: cellToString(get(row, "category")),
        searchText: buildProductSearchText({ code, description: description ?? "", brand }),
      },
    });
  }
  return { rows: out, skipped };
}
