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
