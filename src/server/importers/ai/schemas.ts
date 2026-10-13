import { z } from "zod";

/** Saída estruturada do agente que lê pedidos (PDF ou imagem). */
export const OrderExtractionSchema = z.object({
  orderNumber: z.string(),
  issuedAt: z.string(),
  customer: z.object({
    code: z.string().nullable(),
    document: z.string().nullable(),
    name: z.string().nullable(),
  }),
  repCode: z.string().nullable(),
  paymentTerms: z.string().nullable(),
  total: z.number().nullable(),
  lines: z.array(
    z.object({
      code: z.string(),
      description: z.string(),
      unit: z.string().nullable(),
      qty: z.number(),
      unitPrice: z.number(),
      lineTotal: z.number().nullable(),
      confidence: z.number(),
    }),
  ),
});
export type OrderExtraction = z.infer<typeof OrderExtractionSchema>;

/** Saída estruturada do agente que lê encartes de oferta (imagem ou PDF). */
export const PromotionExtractionSchema = z.object({
  title: z.string().nullable(),
  supplierBrand: z.string().nullable(),
  offerValidity: z.object({
    startsOn: z.string().nullable(),
    endsOn: z.string().nullable(),
    evidence: z.string().nullable(),
  }),
  targetSegmentsHint: z.array(z.string()),
  items: z.array(
    z.object({
      codeRaw: z.string().nullable(),
      description: z.string(),
      packText: z.string().nullable(),
      price: z.number(),
      priceUnit: z.enum(["un", "pct", "kg", "cx", "outro"]),
      boxPrice: z.number().nullable(),
      regularPrice: z.number().nullable(),
      priceType: z.enum(["unit_price", "min_qty", "bundle", "other"]),
      minQty: z.number().nullable(),
      conditionText: z.string().nullable(),
      productExpiryDate: z.string().nullable(),
      confidence: z.number(),
    }),
  ),
});
export type PromotionExtraction = z.infer<typeof PromotionExtractionSchema>;
