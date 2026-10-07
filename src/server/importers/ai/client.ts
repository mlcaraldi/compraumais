import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import sharp from "sharp";
import type { z } from "zod";

export const DEFAULT_IMPORTER_MODEL = "claude-opus-5-5";
export const MAX_OUTPUT_TOKENS = 16000;
const MAX_IMAGE_SIDE = 2000;

/** US$ por milhão de tokens (entrada, saída). */
export const PRICE_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
};

/** Custo estimado em centavos de dólar; 0 se o modelo não está na tabela. */
export function estimateCostUsdCents(model: string, inputTokens: number, outputTokens: number) {
  const p = PRICE_USD_PER_MTOK[model];
  if (!p) return 0;
  return ((inputTokens * p.input + outputTokens * p.output) / 1_000_000) * 100;
}

/** A IA se recusou a responder: falha definitiva, o usuário cadastra manualmente. */
export class AiRefusalError extends Error {
  constructor() {
    super("A IA recusou; cadastrar manualmente");
    this.name = "AiRefusalError";
  }
}
/** A resposta não obedeceu ao schema (parsed_output nulo); guarda o texto bruto. */
export class AiNullOutputError extends Error {
  constructor(public rawText: string) {
    super("A IA não devolveu uma resposta no formato esperado");
    this.name = "AiNullOutputError";
  }
}
/** Limite de taxa, 5xx ou queda de rede: vale tentar de novo. */
export class AiRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiRetryableError";
  }
}
/** Erro 400 e afins: tentar de novo não resolve. */
export class AiPermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiPermanentError";
  }
}

export type AiAttachment = { kind: "image"; data: Buffer } | { kind: "pdf"; data: Buffer };

export type AiRequest<S extends z.ZodType> = {
  system?: string;
  prompt: string;
  /** vão antes do texto, na ordem dada */
  attachments?: AiAttachment[];
  schema: S;
  model?: string;
};

export type AiResult<T> = {
  data: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCentsEstimate: number;
};

/** Reduz para no máximo 2000 px no lado maior e converte para JPEG qualidade 90. */
export async function prepareImage(data: Buffer): Promise<Buffer> {
  return sharp(data)
    .rotate()
    .resize({
      width: MAX_IMAGE_SIDE,
      height: MAX_IMAGE_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90 })
    .toBuffer();
}

type MessagesApi = { messages: Pick<Anthropic["messages"], "parse"> };

let shared: Anthropic | undefined;
function defaultClient(): MessagesApi {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiPermanentError("ANTHROPIC_API_KEY não definida");
  shared ??= new Anthropic();
  return shared;
}

function classify(e: unknown): Error {
  if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError)
    return new AiRetryableError(e.message);
  if (e instanceof Anthropic.APIConnectionError) return new AiRetryableError(e.message);
  if (e instanceof Anthropic.APIError && typeof e.status === "number" && e.status >= 500)
    return new AiRetryableError(e.message);
  if (e instanceof Anthropic.APIError) return new AiPermanentError(e.message);
  return e instanceof Error ? e : new Error(String(e));
}

/**
 * Chama a Claude com saída estruturada (messages.parse + zodOutputFormat).
 * `client` existe para os testes injetarem um SDK falso.
 */
export async function extractStructured<S extends z.ZodType>(
  req: AiRequest<S>,
  client: MessagesApi = defaultClient(),
): Promise<AiResult<z.infer<S>>> {
  const model = req.model ?? process.env.IMPORTER_MODEL ?? DEFAULT_IMPORTER_MODEL;
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const a of req.attachments ?? []) {
    if (a.kind === "image") {
      const jpeg = await prepareImage(a.data);
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") },
      });
    } else {
      blocks.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: a.data.toString("base64"),
        },
      });
    }
  }
  blocks.push({ type: "text", text: req.prompt });

  let message;
  try {
    message = await client.messages.parse({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      ...(req.system ? { system: req.system } : {}),
      messages: [{ role: "user", content: blocks }],
      output_config: { effort: "medium", format: zodOutputFormat(req.schema) },
    });
  } catch (e) {
    throw classify(e);
  }

  if (message.stop_reason === "refusal") throw new AiRefusalError();
  if (message.parsed_output === null || message.parsed_output === undefined) {
    const raw = message.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    throw new AiNullOutputError(raw);
  }
  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;
  return {
    data: message.parsed_output as z.infer<S>,
    model,
    inputTokens,
    outputTokens,
    costCentsEstimate: estimateCostUsdCents(model, inputTokens, outputTokens),
  };
}
