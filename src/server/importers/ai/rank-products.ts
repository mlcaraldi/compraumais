import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { extractStructured } from "./client";

export const RankingSchema = z.object({
  rankings: z.array(
    z.object({
      ingredientId: z.string(),
      candidates: z.array(
        z.object({ productId: z.string(), score: z.number(), reason: z.string() }),
      ),
    }),
  ),
});
export type Ranking = z.infer<typeof RankingSchema>["rankings"][number];

export type RankInput = {
  ingredientId: string;
  name: string;
  candidates: {
    productId: string;
    description: string;
    brand: string | null;
    packText: string | null;
  }[];
};

export function loadPrompt(name: string) {
  return readFileSync(path.join(process.cwd(), "src/server/importers/ai/prompts", name), "utf8");
}

/** Pede à IA os 3 melhores produtos por ingrediente; descarta ids que não estavam nos candidatos. */
export async function rankProductCandidates(
  items: RankInput[],
  client?: Parameters<typeof extractStructured>[1],
): Promise<Map<string, Ranking["candidates"]>> {
  const out = new Map<string, Ranking["candidates"]>();
  if (items.length === 0) return out;
  const result = await extractStructured(
    {
      system: loadPrompt("vinculo-produtos.md"),
      prompt: JSON.stringify(items),
      schema: RankingSchema,
    },
    client,
  );
  for (const r of result.data.rankings) {
    const source = items.find((i) => i.ingredientId === r.ingredientId);
    if (!source) continue;
    const allowed = new Set(source.candidates.map((c) => c.productId));
    out.set(
      r.ingredientId,
      r.candidates
        .filter((c) => allowed.has(c.productId))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3),
    );
  }
  return out;
}
