import { block, warn, type RowWarning } from "../types";
import type { PromotionExtraction } from "../ai/schemas";
import {
  addDaysIso,
  formatIsoShort,
  parseBrDate,
  parseMoneyCents,
  parseProductCode,
  todayIso,
} from "../../normalize";

export const LOW_CONFIDENCE = 0.8;

export type PromoUnit = "un" | "pct" | "kg" | "cx";

export type PromotionHeaderData = {
  name: string;
  supplierBrand: string | null;
  /** AAAA-MM-DD */
  startsOn: string | null;
  endsOn: string | null;
  /** trecho do encarte que prova a vigência; null quando a data é o padrão sugerido */
  evidence: string | null;
  usedDefaultDates: boolean;
  conditionsText: string | null;
  targetSegmentsHint: string[];
};

export type PromotionItemData = {
  /** código normalizado (4 a 7 dígitos); null se ausente ou ambíguo */
  code: string | null;
  rawCode: string | null;
  ambiguous: boolean;
  description: string;
  brand: string | null;
  packText: string | null;
  priceCents: number;
  priceUnit: PromoUnit | null;
  boxPriceCents: number | null;
  regularPriceCents: number | null;
  priceType: "unit_price" | "min_qty" | "bundle" | "other";
  minQty: number | null;
  conditionText: string | null;
  /** validade do PRODUTO (não da oferta) */
  productExpiryDate: string | null;
  confidence: number | null;
  /** produto escolhido à mão na revisão, quando o código não casa */
  linkedProductId: string | null;
};

const text = (s: string | null | undefined) => {
  const t = s?.trim();
  return t ? t : null;
};

export function validatePromotionItem(d: PromotionItemData): RowWarning[] {
  const w: RowWarning[] = [];
  if (!d.code && !d.linkedProductId)
    w.push(
      block(
        "sem_vinculo",
        d.ambiguous
          ? `Código "${d.rawCode}" ambíguo; digite o código completo, vincule a um produto ou rejeite`
          : d.rawCode
            ? `Código "${d.rawCode}" inválido; corrija, vincule a um produto ou rejeite`
            : "Item sem código; vincule a um produto, digite o código ou rejeite",
      ),
    );
  if (!d.priceUnit)
    w.push(block("unidade_invalida", "Unidade do preço não reconhecida; escolha uma"));
  if (!(d.priceCents > 0)) w.push(block("preco_invalido", "Preço inválido"));
  if (!d.description.trim()) w.push(block("sem_descricao", "Item sem descrição"));
  if (d.confidence !== null && d.confidence < LOW_CONFIDENCE)
    w.push(warn("baixa_confianca", "A leitura deste item tem pouca confiança; confira"));
  return w;
}

export function validatePromotionHeader(h: PromotionHeaderData): RowWarning[] {
  const w: RowWarning[] = [];
  if (!h.startsOn || !h.endsOn)
    w.push(block("vigencia_invalida", "Informe início e fim da oferta"));
  else if (h.endsOn < h.startsOn)
    w.push(block("vigencia_invalida", "O fim da oferta não pode ser antes do início"));
  else if (h.usedDefaultDates)
    w.push(
      warn(
        "vigencia_padrao",
        `O encarte não informa a vigência. Sugerimos ${formatIsoShort(h.startsOn)} a ${formatIsoShort(h.endsOn)}; ajuste se precisar`,
      ),
    );
  if (!h.name.trim()) w.push(block("sem_nome", "Dê um nome ao encarte"));
  return w;
}

/** Normaliza a extração da IA (código, centavos, embalagem, datas). Não consulta o banco. */
export function postProcessPromotion(
  x: PromotionExtraction,
  opts: { now: Date; defaultDays: number },
) {
  const today = todayIso(opts.now);
  // vigência só vale com evidência impressa; "validade do produto" nunca entra aqui
  const hasEvidence = !!text(x.offerValidity.evidence);
  const startsOn = hasEvidence ? parseBrDate(x.offerValidity.startsOn, opts.now) : null;
  const endsOn = hasEvidence ? parseBrDate(x.offerValidity.endsOn, opts.now) : null;
  const usedDefaultDates = !endsOn;
  const brand = text(x.supplierBrand);
  const header: PromotionHeaderData = {
    name: text(x.title) ?? `Encarte${brand ? ` ${brand}` : ""} ${formatIsoShort(today)}`,
    supplierBrand: brand,
    startsOn: startsOn ?? today,
    endsOn: endsOn ?? addDaysIso(startsOn ?? today, opts.defaultDays),
    evidence: usedDefaultDates ? null : text(x.offerValidity.evidence),
    usedDefaultDates,
    conditionsText: null,
    targetSegmentsHint: x.targetSegmentsHint.map((s) => s.trim()).filter(Boolean),
  };
  const items: PromotionItemData[] = x.items.map((i) => {
    const parsed = parseProductCode(i.codeRaw);
    const unit = i.priceUnit === "outro" ? null : i.priceUnit;
    return {
      code: parsed.ambiguous ? null : parsed.code,
      rawCode: text(i.codeRaw),
      ambiguous: parsed.ambiguous,
      description: i.description.trim(),
      brand,
      packText: text(i.packText),
      priceCents: parseMoneyCents(i.price) ?? 0,
      priceUnit: unit,
      boxPriceCents: i.boxPrice === null ? null : parseMoneyCents(i.boxPrice),
      regularPriceCents: i.regularPrice === null ? null : parseMoneyCents(i.regularPrice),
      priceType: i.priceType,
      minQty: i.minQty,
      conditionText: text(i.conditionText),
      productExpiryDate: parseBrDate(i.productExpiryDate, opts.now),
      confidence: i.confidence,
      linkedProductId: null,
    };
  });
  return { header, items };
}
