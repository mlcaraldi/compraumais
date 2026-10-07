import { excelSerialToIso, normalizeDocument, normalizePhone, parseBrDate } from "../../normalize";
import { warn, type RowWarning } from "../types";
import type { Cell } from "./xlsx-reader";
import { cellToString, headerKey } from "./table";

export const CUSTOMER_FIELDS = [
  "externalCode",
  "document",
  "legalName",
  "tradeName",
  "registeredAt",
  "lastPurchaseAt",
  "blocked",
  "address",
  "addressNumber",
  "district",
  "city",
  "state",
  "phone",
  "segmentRaw",
  "cnae",
] as const;
export type CustomerField = (typeof CUSTOMER_FIELDS)[number];
export type CustomerMapping = Partial<Record<CustomerField, number>>;

export const CUSTOMER_FIELD_LABELS: Record<CustomerField, string> = {
  externalCode: "Código do cliente",
  document: "CPF/CNPJ",
  legalName: "Razão social / nome",
  tradeName: "Nome fantasia",
  registeredAt: "Data de cadastro",
  lastPurchaseAt: "Data da última compra",
  blocked: "Bloqueio",
  address: "Endereço",
  addressNumber: "Número",
  district: "Bairro",
  city: "Município",
  state: "Estado",
  phone: "Telefone",
  segmentRaw: "Ramo de atividade",
  cnae: "CNAE",
};

export const REQUIRED_CUSTOMER_FIELDS: CustomerField[] = ["externalCode", "legalName"];

const HEADER_ALIASES: Record<string, CustomerField> = {
  CODIGOCLIENTE: "externalCode",
  CODCLIENTE: "externalCode",
  CODIGO: "externalCode",
  CPFCNPJ: "document",
  CNPJ: "document",
  CPF: "document",
  DOCUMENTO: "document",
  NOMECLIENTE: "legalName",
  RAZAOSOCIAL: "legalName",
  NOME: "legalName",
  FANTASIA: "tradeName",
  NOMEFANTASIA: "tradeName",
  DTCADASTRO: "registeredAt",
  DATACADASTRO: "registeredAt",
  DTULTCOMPRA: "lastPurchaseAt",
  DATAULTCOMPRA: "lastPurchaseAt",
  DATAULTIMACOMPRA: "lastPurchaseAt",
  BLOQUEIO: "blocked",
  BLOQUEADO: "blocked",
  ENDERECOENTREGA: "address",
  ENDERECO: "address",
  N: "addressNumber",
  NUMERO: "addressNumber",
  BAIRROENTREGA: "district",
  BAIRRO: "district",
  MUNICIPIO: "city",
  CIDADE: "city",
  ESTADO: "state",
  UF: "state",
  TELEFONE: "phone",
  FONE: "phone",
  CELULAR: "phone",
  RAMOATIVIDADE: "segmentRaw",
  RAMO: "segmentRaw",
  CNAE: "cnae",
};

/** Mapeia colunas pelo cabeçalho. Campos não encontrados ficam fora do resultado. */
export function detectCustomerMapping(headers: Cell[]): CustomerMapping {
  const mapping: CustomerMapping = {};
  headers.forEach((h, i) => {
    const field = HEADER_ALIASES[headerKey(h)];
    if (field && mapping[field] === undefined) mapping[field] = i;
  });
  return mapping;
}

export type ParsedCustomer = {
  externalCode: string;
  document: string | null;
  documentValid: boolean | null;
  legalName: string;
  tradeName: string | null;
  registeredAt: string | null;
  lastPurchaseAt: string | null;
  blocked: boolean;
  address: string | null;
  addressNumber: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  phoneRaw: string | null;
  phoneE164: string | null;
  phoneKind: "mobile" | "landline" | "invalid" | null;
  segmentRaw: string | null;
  cnae: string | null;
};

export type ParsedCustomerRow = {
  rowNumber: number;
  data: ParsedCustomer;
  warnings: RowWarning[];
};

function toDate(cell: Cell | undefined, today: Date): string | null {
  if (typeof cell === "number") return excelSerialToIso(cell);
  const s = cellToString(cell);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return parseBrDate(s, today);
}

/** Linhas sem código de cliente (rodapé com filtros da exportação, linhas vazias) são ignoradas. */
export function parseCustomerRows(
  rows: Cell[][],
  mapping: CustomerMapping,
  headerRow = 0,
  today: Date = new Date(),
): { rows: ParsedCustomerRow[]; skipped: number } {
  const out: ParsedCustomerRow[] = [];
  let skipped = 0;
  const get = (row: Cell[], f: CustomerField): Cell | undefined =>
    mapping[f] === undefined ? undefined : row[mapping[f]!];

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const code = cellToString(get(row, "externalCode"));
    if (!code) {
      if (row.some((c) => cellToString(c))) skipped++;
      continue;
    }
    const warnings: RowWarning[] = [];

    const docRaw = cellToString(get(row, "document"));
    let document: string | null = null;
    let documentValid: boolean | null = null;
    if (docRaw) {
      const d = normalizeDocument(docRaw);
      document = d.digits || null;
      documentValid = d.valid;
      if (!d.valid)
        warnings.push(warn("documento_invalido", "CPF/CNPJ inválido (dígitos verificadores)"));
    }

    const phoneRaw = cellToString(get(row, "phone"));
    let phoneE164: string | null = null;
    let phoneKind: ParsedCustomer["phoneKind"] = null;
    if (phoneRaw) {
      const p = normalizePhone(phoneRaw);
      phoneE164 = p.e164;
      phoneKind = p.kind;
      if (p.kind === "invalid")
        warnings.push(warn("telefone_invalido", "Telefone inválido ou sem DDD"));
      else if (p.fixedNinthDigit)
        warnings.push(warn("telefone_corrigido", "Adicionado o 9 após o DDD"));
      else if (p.kind === "landline")
        warnings.push(warn("telefone_fixo", "Telefone fixo, sem WhatsApp provável"));
    }

    const blockedRaw = get(row, "blocked");
    const blocked = blockedRaw === true || /^(S|SIM|1|TRUE)$/i.test(cellToString(blockedRaw) ?? "");

    out.push({
      rowNumber: i + 1,
      warnings,
      data: {
        externalCode: code,
        document,
        documentValid,
        legalName: cellToString(get(row, "legalName")) ?? `Cliente ${code}`,
        tradeName: cellToString(get(row, "tradeName")),
        registeredAt: toDate(get(row, "registeredAt"), today),
        lastPurchaseAt: toDate(get(row, "lastPurchaseAt"), today),
        blocked,
        address: cellToString(get(row, "address")),
        addressNumber: cellToString(get(row, "addressNumber")),
        district: cellToString(get(row, "district")),
        city: cellToString(get(row, "city")),
        state: cellToString(get(row, "state")),
        phoneRaw,
        phoneE164,
        phoneKind,
        segmentRaw: cellToString(get(row, "segmentRaw")),
        cnae: cellToString(get(row, "cnae")),
      },
    });
  }
  return { rows: out, skipped };
}
