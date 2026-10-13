import type { Db } from "../db/client";
import { buildProductSearchText, normalizeSaleUnit } from "../importers/spreadsheet/products";
import { parseMoneyCents, parsePack } from "../normalize";
import { auditRepo, productsRepo } from "../repos";

export async function updateProductFromForm(
  db: Db,
  tenantId: string,
  productId: string,
  input: {
    description: string;
    brand?: string | null;
    packText?: string | null;
    saleUnit?: string | null;
    price?: string | null;
    category?: string | null;
    sellable: boolean;
  },
  userId?: string,
) {
  const current = await productsRepo.getProductById(db, tenantId, productId);
  if (!current) throw new Error("Produto não encontrado");
  const description = input.description.trim();
  if (!description) throw new Error("A descrição é obrigatória");
  const brand = input.brand?.trim() || null;
  const packText = input.packText?.trim() || null;
  const pack = parsePack(packText) ?? parsePack(description);
  const priceCents = input.price?.trim() ? parseMoneyCents(input.price) : null;
  if (input.price?.trim() && priceCents === null) throw new Error("Preço inválido");
  const patch = {
    description,
    brand,
    packText,
    packQty: pack ? String(pack.qty) : null,
    packUnitSize: pack?.unitSize ? String(pack.unitSize) : null,
    packUnit: pack?.unit ?? null,
    saleUnit: normalizeSaleUnit(input.saleUnit ?? null),
    listPriceCents: priceCents,
    priceUpdatedAt: priceCents !== current.listPriceCents ? new Date() : current.priceUpdatedAt,
    category: input.category?.trim() || null,
    sellable: input.sellable,
    searchText: buildProductSearchText({ code: current.code, description, brand }),
  };
  await productsRepo.updateProduct(db, tenantId, productId, patch);
  await auditRepo.writeAudit(db, tenantId, {
    userId,
    action: "product.update",
    entity: "product",
    entityId: productId,
    diff: patch,
  });
}
