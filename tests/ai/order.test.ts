import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractStructured } from "@/server/importers/ai/client";
import { loadPrompt } from "@/server/importers/ai/rank-products";
import { OrderExtractionSchema } from "@/server/importers/ai/schemas";
import {
  postProcessOrder,
  validateOrderHeader,
  validateOrderLine,
} from "@/server/importers/order/postprocess";

const FILE = "data/real/pedido-2707401471.pdf";
const enabled = existsSync(FILE) && !!process.env.ANTHROPIC_API_KEY;
if (!enabled) console.warn(`[tests/ai] pulando pedido: precisa de ${FILE} e ANTHROPIC_API_KEY`);

// Usa a API real da Claude (paga). Rode só com `pnpm test:ai`.
describe.skipIf(!enabled)("T09: leitura do pedido 2707401471", () => {
  it("extrai número, linhas, quantidades, preços e total sem aviso de soma", async () => {
    const result = await extractStructured({
      system: loadPrompt("order.md"),
      prompt: "Extraia os dados deste pedido.",
      attachments: [{ kind: "pdf", data: readFileSync(FILE) }],
      schema: OrderExtractionSchema,
    });
    const p = postProcessOrder(result.data);
    expect(p.header.orderNumber).toBe("2707401471");
    expect(p.header.totalCents).toBe(13470);
    expect(p.lines.map((l) => [l.code, l.qty, l.unitPriceCents])).toEqual([
      ["166225", 2, 1664],
      ["108576", 2, 2794],
      ["110647", 1, 4554],
    ]);
    expect(validateOrderHeader(p.header, p.lines)).toEqual([]);
    expect(p.lines.flatMap(validateOrderLine).filter((w) => w.severity === "blocking")).toEqual([]);
  });
});
