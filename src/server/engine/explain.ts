import { formatCents, formatIsoShort, titleCase } from "../normalize";
import type { EngineWarning, Reason } from "./types";

type Names = {
  products: Record<string, { description: string }>;
  recipes: Record<string, { name: string }>;
};

/** Justificativa em frases curtas, para o representante entender por que o item apareceu. */
export function explainReasons(reasons: Reason[], names: Names): string[] {
  const out: string[] = [];
  const anchors = reasons.filter((r) => r.type === "anchor");
  for (const r of anchors) {
    if (r.type !== "anchor") continue;
    const anchor = names.products[r.anchorProductId]?.description;
    const recipe = names.recipes[r.recipeId]?.name;
    if (anchor && recipe) out.push(`O pedido tem ${titleCase(anchor)}, que leva ${recipe}.`);
  }
  for (const r of reasons) {
    if (r.type === "completes_recipes" && r.recipeIds.length > 1)
      out.push(`Completa ${r.recipeIds.length} receitas do cliente.`);
    else if (r.type === "completes_recipes" && anchors.length === 0) {
      const n = names.recipes[r.recipeIds[0]!]?.name;
      if (n) out.push(`Entra na receita ${n}, que o cliente faz.`);
    } else if (r.type === "last_purchase")
      out.push(
        r.daysAgo === null
          ? "O cliente ainda não comprou este item."
          : `Última compra há ${r.daysAgo} dia(s); a cobertura estimada é de ${Math.round(r.coverageDays)} dia(s).`,
      );
    else if (r.type === "promotion") {
      const was =
        r.regularPriceCents && r.regularPriceCents > r.priceCents
          ? `, de ${formatCents(r.regularPriceCents)}`
          : "";
      out.push(
        `Em oferta por ${formatCents(r.priceCents)}${was}, até ${formatIsoShort(r.endsOn)}.`,
      );
    } else if (r.type === "regular_item_missing")
      out.push("O cliente compra este item com frequência e ele ficou fora do pedido.");
  }
  return out;
}

export const WARNING_TEXT: Record<EngineWarning, string> = {
  customer_blocked: "Cliente bloqueado na Dellys. Confirme com o financeiro antes de oferecer.",
  no_whatsapp: "O telefone do cliente não serve para WhatsApp (fixo ou inválido).",
  no_recipes: "O cliente não tem receitas associadas, então só saem ofertas por categoria.",
  no_anchor: "Nenhum ingrediente âncora das receitas do cliente está neste pedido.",
  unmapped_ingredients: "Há ingredientes das receitas sem produto vinculado.",
};
