import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractStructured } from "@/server/importers/ai/client";
import { loadPrompt } from "@/server/importers/ai/rank-products";
import { PromotionExtractionSchema } from "@/server/importers/ai/schemas";
import { postProcessPromotion } from "@/server/importers/promotion/postprocess";
import manifest from "./encartes.manifest.json";

const DIR = "data/real/encartes";
const enabled = existsSync(DIR) && !!process.env.ANTHROPIC_API_KEY;
if (!enabled) console.warn(`[tests/ai] pulando encartes: precisa de ${DIR} e ANTHROPIC_API_KEY`);

const canon = (s: string | null) =>
  (s ?? "")
    .toUpperCase()
    .replace(/C[ÓO]D(IGO)?\.?:?/g, "")
    .replace(/\s/g, "");

type Golden = { codeRaw: string; price: number; priceUnit?: string; packText?: string };

// Usa a API real da Claude (paga). Rode só com `pnpm test:ai`.
describe.skipIf(!enabled)("T10: leitura dos encartes reais", () => {
  for (const enc of manifest.encartes) {
    const file = path.join(DIR, enc.file);
    it.skipIf(!existsSync(file))(
      `${enc.label}: ${enc.itemCount} itens, ≥ 95% de código, preço e unidade corretos`,
      async () => {
        const { data } = await extractStructured({
          system: loadPrompt("promotion.md"),
          prompt: "Extraia os itens deste encarte de ofertas.",
          attachments: [{ kind: "image", data: readFileSync(file) }],
          schema: PromotionExtractionSchema,
        });
        expect(data.items).toHaveLength(enc.itemCount);
        let checked = 0;
        let correct = 0;
        for (const g of enc.items as Golden[]) {
          const found = data.items.find((i) => canon(i.codeRaw) === canon(g.codeRaw));
          checked += 1;
          if (found) correct += 1;
          if (found) {
            checked += 1;
            if (Math.abs(found.price - g.price) < 0.005) correct += 1;
          } else checked += 1;
          if (g.priceUnit) {
            checked += 1;
            if (found?.priceUnit === g.priceUnit) correct += 1;
          }
          if (g.packText) {
            expect(canon(found?.packText ?? null)).toBe(canon(g.packText));
          }
        }
        expect(correct / checked).toBeGreaterThanOrEqual(0.95);

        const processed = postProcessPromotion(data, {
          now: new Date("2026-10-07T15:00:00Z"),
          defaultDays: 7,
        });
        // nenhum desses encartes traz a vigência da oferta
        expect(processed.header.usedDefaultDates).toBe(true);

        const lw = (enc as { lambWeston?: Record<string, unknown> }).lambWeston;
        if (lw) {
          const i = data.items[0]!;
          expect(i.boxPrice).toBe(lw.boxPrice);
          expect(i.priceType).toBe(lw.priceType);
          expect(i.productExpiryDate).toBe(lw.productExpiryDate);
          expect(data.offerValidity.endsOn).toBeNull();
        }
        const amb = (enc as { ambiguousCodes?: string[] }).ambiguousCodes;
        if (amb) {
          for (const code of amb) {
            const idx = data.items.findIndex((i) => canon(i.codeRaw) === canon(code));
            expect(idx).toBeGreaterThanOrEqual(0);
            expect(processed.items[idx]!.ambiguous).toBe(true);
            expect(processed.items[idx]!.code).toBeNull();
          }
          const ok = processed.items.find(
            (_, k) => canon(data.items[k]!.codeRaw) === canon("169.115"),
          );
          expect(ok?.code).toBe("169115");
        }
      },
    );
  }
});
