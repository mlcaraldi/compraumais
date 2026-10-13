import type { EngineSettings } from "./settings";

export type Unit3 = "g" | "ml" | "un";
export type SaleUnit = "un" | "pct" | "kg" | "cx";

export type EngineProduct = {
  id: string;
  description: string;
  brand: string | null;
  sellable: boolean;
  /** quantidade total da embalagem em g, ml ou un */
  packTotal: number | null;
  packUnit: Unit3 | null;
  saleUnit: SaleUnit | null;
  listPriceCents: number | null;
  category: string | null;
};

export type EngineRecipe = {
  id: string;
  name: string;
  items: {
    ingredientId: string;
    qtyPerPortion: number;
    unit: Unit3;
    isAnchor: boolean;
    isEssential: boolean;
  }[];
};

export type EnginePromotionItem = {
  promotionItemId: string;
  productId: string;
  priceCents: number;
  priceUnit: string;
  priceType: string;
  minQty: number | null;
  /** AAAA-MM-DD */
  endsOn: string;
  regularPriceCents: number | null;
};

export type EngineInput = {
  now: Date;
  order: { id: string; issuedAt: Date; lines: { productId: string; qty: number }[] };
  customer: { id: string; blocked: boolean; segmentCode: string | null; phoneKind: string };
  customerRecipes: { recipeId: string; portionsPerDay: number | null }[];
  recipes: EngineRecipe[];
  /** ingrediente -> `isCommodity`; usado só quando a receita não tem âncora marcada */
  ingredients: Record<string, { isCommodity: boolean }>;
  /** só vínculos aprovados */
  ingredientProducts: { ingredientId: string; productId: string; priority: number }[];
  products: Record<string, EngineProduct>;
  /** pedidos confirmados anteriores ao atual, mais recentes primeiro */
  history: { productId: string; qty: number; date: Date; orderId: string }[];
  activePromotions: EnginePromotionItem[];
  /** produtos que o cliente recusou em sugestões anteriores */
  declines: { productId: string; date: Date }[];
  settings: EngineSettings;
};

export type Reason =
  | { type: "anchor"; anchorProductId: string; recipeId: string }
  | { type: "completes_recipes"; recipeIds: string[] }
  | { type: "last_purchase"; daysAgo: number | null; coverageDays: number }
  | { type: "promotion"; endsOn: string; priceCents: number; regularPriceCents: number | null }
  | { type: "regular_item_missing" }
  | { type: "unmapped_ingredient"; ingredientId: string };

export type EngineWarning =
  "customer_blocked" | "no_whatsapp" | "no_recipes" | "no_anchor" | "unmapped_ingredients";

export type EngineItem = {
  list: "A" | "B" | "reminder";
  productId: string;
  recipeIds: string[];
  promotionItemId: string | null;
  priceCents: number | null;
  priceUnit: string | null;
  priceSource: "promotion" | "list" | null;
  /** quantidade mínima da oferta, quando houver */
  minQty: number | null;
  score: number;
  reasons: Reason[];
};

export type Pendency = { type: "unmapped_ingredient"; ingredientId: string; recipeId: string };

export type EngineOutput = {
  engineVersion: string;
  items: EngineItem[];
  warnings: EngineWarning[];
  /** ingredientes sem produto vinculado nas receitas ativadas */
  pendencies: Pendency[];
};
