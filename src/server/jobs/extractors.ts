import type { Db } from "../db/client";

export type ExtractContext = { db: Db; tenantId: string; jobId: string };

/**
 * Um extrator lê o documento do job, grava `import_rows` e deixa o job em `review`.
 * Os importadores de pedido (T09) e de encarte (T10) se registram aqui.
 */
export type Extractor = (ctx: ExtractContext) => Promise<void>;

const registry = new Map<string, Extractor>();

export function registerExtractor(kind: string, fn: Extractor) {
  registry.set(kind, fn);
}
export function getExtractor(kind: string) {
  return registry.get(kind);
}
export function clearExtractors() {
  registry.clear();
}

/**
 * Extratores padrão, carregados sob demanda para o worker e o modo inline não dependerem
 * de efeitos colaterais de import. Um extrator registrado à mão (testes) tem prioridade.
 */
export async function resolveExtractor(kind: string): Promise<Extractor | undefined> {
  const registered = registry.get(kind);
  if (registered) return registered;
  if (kind === "order") {
    const { extractOrder } = await import("../services/import-order");
    return (ctx) => extractOrder(ctx);
  }
  if (kind === "promotion") {
    const { extractPromotion } = await import("../services/import-promotion");
    return (ctx) => extractPromotion(ctx);
  }
  return undefined;
}
