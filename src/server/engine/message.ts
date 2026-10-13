import { formatCents, formatIsoShort, titleCase, todayIso } from "../normalize";
import type { EngineItem } from "./types";

export type MessageInput = {
  customer: { contactName: string | null; tradeName: string | null; legalName: string };
  order: { issuedAt: Date };
  /** itens da lista A e B, na ordem de exibição; lembretes não entram */
  items: EngineItem[];
  products: Record<string, { description: string }>;
  recipes: Record<string, { name: string }>;
  now: Date;
};

const UNIT_LABEL: Record<string, string> = { un: "un", pct: "pacote", kg: "kg", cx: "caixa" };

function priceText(item: EngineItem): string | null {
  if (item.priceCents === null) return null;
  const unit = item.priceUnit ? UNIT_LABEL[item.priceUnit] : null;
  return `${formatCents(item.priceCents)}${unit ? `/${unit}` : ""}`;
}

/** Nome do produto sem código, em formato título. */
export const shortProductName = (description: string) => titleCase(description);

function greetingName(c: MessageInput["customer"]) {
  // nunca a razão social, a menos que não haja mais nada
  return c.contactName?.trim() || titleCase(c.tradeName) || titleCase(c.legalName);
}

function endsOn(item: EngineItem): string | null {
  const r = item.reasons.find((x) => x.type === "promotion");
  return r && r.type === "promotion" ? r.endsOn : null;
}

function lineFor(item: EngineItem, input: MessageInput): string {
  const name = shortProductName(input.products[item.productId]?.description ?? "");
  const price = priceText(item);
  if (price === null) return `${name}: posso te passar o preço.`;
  const until = endsOn(item);
  const min = item.minQty ? ` a partir de ${item.minQty}` : "";
  if (item.list === "A") {
    const names = item.recipeIds
      .map((id) => input.recipes[id]?.name)
      .filter((n): n is string => !!n)
      .slice(0, 2);
    const target = names.length === 2 ? `as receitas ${names[0]} e ${names[1]}` : names[0];
    const offer =
      item.priceSource === "promotion" && until ? `, em oferta até ${formatIsoShort(until)}` : "";
    return `${target ? `Para ${target}, faltou` : "Faltou"} ${name}: ${price}${min}${offer}.`;
  }
  return `${name} está em oferta esta semana: ${price}${min}${until ? ` até ${formatIsoShort(until)}` : ""}.`;
}

/**
 * Mensagem de WhatsApp em primeira pessoa (quem envia é o representante). Determinística, sem IA.
 * Tom do guia de marca: "você", sem "imperdível", um "!" só na saudação, sem emoji.
 */
export function buildMessage(input: MessageInput): string {
  const sameDay = todayIso(input.order.issuedAt) === todayIso(input.now);
  const when = sameDay ? "de hoje" : `do dia ${formatIsoShort(todayIso(input.order.issuedAt))}`;
  const lines = input.items.filter((i) => i.list !== "reminder").slice(0, 3);
  return [
    `Oi, ${greetingName(input.customer)}! Recebi seu pedido ${when}.`,
    ...lines.map((i) => lineFor(i, input)),
    "Se quiser, incluo no mesmo pedido e vai na mesma entrega. É só me responder.",
  ].join("\n");
}

export { whatsappLink } from "./whatsapp";
