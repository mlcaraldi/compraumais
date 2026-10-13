import { block, warn, type RowWarning } from "../types";
import type { OrderExtraction } from "../ai/schemas";
import { parseBrDate, parseMoneyCents, parseProductCode } from "../../normalize";

export const SUM_TOLERANCE_CENTS = 5;
export const LINE_TOLERANCE_CENTS = 2;
export const LOW_CONFIDENCE = 0.8;

export type OrderHeaderData = {
  orderNumber: string;
  /** AAAA-MM-DD */
  issuedAt: string | null;
  customer: { code: string | null; document: string | null; name: string | null };
  repCode: string | null;
  paymentTerms: string | null;
  totalCents: number | null;
  customerId: string | null;
  /** sugestões por nome; nunca vinculam sozinhas */
  suggestions: { id: string; label: string; score: number }[];
};

export type OrderLineData = {
  /** código normalizado (4 a 7 dígitos) ou null */
  code: string | null;
  rawCode: string;
  description: string;
  unit: string | null;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number | null;
  confidence: number | null;
};

const text = (s: string | null | undefined) => {
  const t = s?.trim();
  return t ? t : null;
};

/** Avisos de uma linha, calculados só a partir dos dados da linha. */
export function validateOrderLine(d: OrderLineData): RowWarning[] {
  const w: RowWarning[] = [];
  const parsed = parseProductCode(d.code ?? d.rawCode);
  if (!parsed.code || parsed.ambiguous)
    w.push(
      block(
        "codigo_invalido",
        `Código "${d.rawCode}" inválido ou ambíguo; corrija ou rejeite a linha`,
      ),
    );
  if (!(d.qty > 0)) w.push(block("quantidade_invalida", "Quantidade precisa ser maior que zero"));
  if (!d.description.trim()) w.push(block("sem_descricao", "Linha sem descrição"));
  if (d.lineTotalCents !== null) {
    const expected = Math.round(d.qty * d.unitPriceCents);
    if (Math.abs(expected - d.lineTotalCents) > LINE_TOLERANCE_CENTS)
      w.push(warn("conta_divergente", "Quantidade × valor unitário não bate com o total da linha"));
  }
  if (d.confidence !== null && d.confidence < LOW_CONFIDENCE)
    w.push(warn("baixa_confianca", "A leitura desta linha tem pouca confiança; confira"));
  return w;
}

/** Soma dos totais de linha (ou qty × preço quando o total não veio). */
export function sumLines(lines: OrderLineData[]): number {
  return lines.reduce(
    (acc, l) => acc + (l.lineTotalCents ?? Math.round(l.qty * l.unitPriceCents)),
    0,
  );
}

export function validateOrderHeader(
  h: Pick<OrderHeaderData, "orderNumber" | "issuedAt" | "totalCents">,
  lines: OrderLineData[],
): RowWarning[] {
  const w: RowWarning[] = [];
  if (!h.orderNumber.trim()) w.push(block("sem_numero", "Pedido sem número"));
  if (!h.issuedAt) w.push(block("data_invalida", "Data de emissão inválida (use dd/mm/aaaa)"));
  if (h.totalCents !== null && lines.length > 0) {
    const sum = sumLines(lines);
    if (Math.abs(sum - h.totalCents) > SUM_TOLERANCE_CENTS)
      w.push(warn("soma_divergente", "A soma das linhas não bate com o total do pedido"));
  }
  return w;
}

/** Normaliza a extração da IA: código, dinheiro em centavos, datas. Não consulta o banco. */
export function postProcessOrder(x: OrderExtraction) {
  const header: Omit<OrderHeaderData, "customerId" | "suggestions"> = {
    orderNumber: x.orderNumber.trim(),
    issuedAt: parseBrDate(x.issuedAt),
    customer: {
      code: text(x.customer.code),
      document: text(x.customer.document),
      name: text(x.customer.name),
    },
    repCode: text(x.repCode),
    paymentTerms: text(x.paymentTerms),
    totalCents: x.total === null ? null : parseMoneyCents(x.total),
  };
  const lines: OrderLineData[] = x.lines.map((l) => {
    const parsed = parseProductCode(l.code);
    return {
      code: parsed.ambiguous ? null : parsed.code,
      rawCode: l.code.trim(),
      description: l.description.trim(),
      unit: text(l.unit),
      qty: l.qty,
      unitPriceCents: parseMoneyCents(l.unitPrice) ?? 0,
      lineTotalCents: l.lineTotal === null ? null : parseMoneyCents(l.lineTotal),
      confidence: l.confidence,
    };
  });
  return { header, lines };
}
