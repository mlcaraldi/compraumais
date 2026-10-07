import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import sharp from "sharp";
import {
  AiNullOutputError,
  AiPermanentError,
  AiRefusalError,
  AiRetryableError,
  estimateCostUsdCents,
  extractStructured,
  prepareImage,
} from "@/server/importers/ai/client";

const Schema = z.object({ total: z.number() });

type Parse = Parameters<typeof extractStructured>[1];
const fake = (parse: (...a: unknown[]) => unknown) =>
  ({ messages: { parse: vi.fn(parse) } }) as unknown as NonNullable<Parse> & {
    messages: { parse: ReturnType<typeof vi.fn> };
  };

const ok = (over: Record<string, unknown> = {}) => ({
  stop_reason: "end_turn",
  parsed_output: { total: 12 },
  content: [{ type: "text", text: '{"total":12}' }],
  usage: { input_tokens: 1000, output_tokens: 500 },
  ...over,
});

describe("cliente de IA (SDK mockado)", () => {
  it("devolve o resultado tipado, tokens e custo, e monta a chamada do jeito do CLAUDE.md", async () => {
    const client = fake(async () => ok());
    const img = await sharp({
      create: { width: 3000, height: 1000, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    const r = await extractStructured(
      {
        prompt: "extraia",
        attachments: [
          { kind: "image", data: img },
          { kind: "pdf", data: Buffer.from("%PDF-1.4") },
        ],
        schema: Schema,
        model: "claude-opus-5-5",
      },
      client,
    );
    expect(r.data).toEqual({ total: 12 });
    expect(r.inputTokens).toBe(1000);
    expect(r.outputTokens).toBe(500);
    // (1000 * 4 + 500 * 20) / 1e6 dólares = 1,4 centavo de dólar
    expect(r.costCentsEstimate).toBeCloseTo(1.4, 6);
    const args = client.messages.parse.mock.calls[0]![0] as {
      model: string;
      max_tokens: number;
      thinking?: unknown;
      tool_choice?: unknown;
      output_config: { effort: string; format: unknown };
      messages: { content: { type: string; source?: { media_type: string } }[] }[];
    };
    expect(args.model).toBe("claude-opus-5-5");
    expect(args.max_tokens).toBe(16000);
    expect(args.output_config.effort).toBe("medium");
    expect(args.output_config.format).toBeTruthy();
    expect(args.thinking).toBeUndefined();
    expect(args.tool_choice).toBeUndefined();
    const content = args.messages[0]!.content;
    expect(content.map((b) => b.type)).toEqual(["image", "document", "text"]);
    expect(content[0]!.source!.media_type).toBe("image/jpeg");
    expect(content[1]!.source!.media_type).toBe("application/pdf");
  });

  it("usa IMPORTER_MODEL quando o modelo não é informado", async () => {
    const client = fake(async () => ok());
    process.env.IMPORTER_MODEL = "claude-sonnet-5-5";
    try {
      const r = await extractStructured({ prompt: "x", schema: Schema }, client);
      expect(r.model).toBe("claude-sonnet-5-5");
      expect(estimateCostUsdCents("claude-sonnet-5-5", 1_000_000, 1_000_000)).toBe(1200);
    } finally {
      delete process.env.IMPORTER_MODEL;
    }
  });

  it("parsed_output nulo vira AiNullOutputError com o texto bruto", async () => {
    const client = fake(async () =>
      ok({ parsed_output: null, content: [{ type: "text", text: "quebrado" }] }),
    );
    const err = await extractStructured({ prompt: "x", schema: Schema }, client).catch((e) => e);
    expect(err).toBeInstanceOf(AiNullOutputError);
    expect((err as AiNullOutputError).rawText).toBe("quebrado");
  });

  it("recusa vira AiRefusalError", async () => {
    const client = fake(async () => ok({ stop_reason: "refusal", parsed_output: null }));
    const err = await extractStructured({ prompt: "x", schema: Schema }, client).catch((e) => e);
    expect(err).toBeInstanceOf(AiRefusalError);
    expect((err as Error).message).toBe("A IA recusou; cadastrar manualmente");
  });

  it("429 e 5xx são repetíveis; 400 é definitivo", async () => {
    const h = new Headers();
    const rate = fake(async () => {
      throw new Anthropic.RateLimitError(429, { type: "error" }, "limite", h);
    });
    await expect(extractStructured({ prompt: "x", schema: Schema }, rate)).rejects.toBeInstanceOf(
      AiRetryableError,
    );
    const server = fake(async () => {
      throw new Anthropic.InternalServerError(529, { type: "error" }, "sobrecarga", h);
    });
    await expect(extractStructured({ prompt: "x", schema: Schema }, server)).rejects.toBeInstanceOf(
      AiRetryableError,
    );
    const bad = fake(async () => {
      throw new Anthropic.BadRequestError(400, { type: "error" }, "inválido", h);
    });
    await expect(extractStructured({ prompt: "x", schema: Schema }, bad)).rejects.toBeInstanceOf(
      AiPermanentError,
    );
  });

  it("reduz imagens grandes para 2000 px no lado maior em JPEG", async () => {
    const big = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: "#888" },
    })
      .png()
      .toBuffer();
    const meta = await sharp(await prepareImage(big)).metadata();
    expect(meta.format).toBe("jpeg");
    expect(Math.max(meta.width!, meta.height!)).toBe(2000);
  });
});

describe("rankProductCandidates (SDK mockado)", () => {
  it("mantém só candidatos conhecidos, ordenados por nota, no máximo 3", async () => {
    const { rankProductCandidates } = await import("@/server/importers/ai/rank-products");
    const client = fake(async () =>
      ok({
        parsed_output: {
          rankings: [
            {
              ingredientId: "i1",
              candidates: [
                { productId: "p2", score: 0.4, reason: "a" },
                { productId: "px", score: 0.99, reason: "inventado" },
                { productId: "p1", score: 0.8, reason: "b" },
              ],
            },
            { ingredientId: "desconhecido", candidates: [] },
          ],
        },
      }),
    );
    const r = await rankProductCandidates(
      [
        {
          ingredientId: "i1",
          name: "Queijo",
          candidates: [
            { productId: "p1", description: "QUEIJO A", brand: null, packText: null },
            { productId: "p2", description: "QUEIJO B", brand: null, packText: null },
          ],
        },
      ],
      client,
    );
    expect(r.get("i1")!.map((c) => c.productId)).toEqual(["p1", "p2"]);
    expect(r.has("desconhecido")).toBe(false);
  });
});
