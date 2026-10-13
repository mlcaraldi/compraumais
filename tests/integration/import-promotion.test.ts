import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PromotionExtraction } from "@/server/importers/ai/schemas";
import {
  postProcessPromotion,
  validatePromotionHeader,
  validatePromotionItem,
} from "@/server/importers/promotion/postprocess";
import {
  buildPromotionRows,
  confirmPromotionImport,
  createPromotionUpload,
  editPromotionHeader,
  editPromotionItem,
  extractPromotion,
  linkPromotionItem,
  setPromotionRowStatus,
} from "@/server/services/import-promotion";
import { importsRepo, productsRepo, promotionsRepo } from "@/server/repos";
import { closeDb, resetTestDb } from "../helpers/db";

let ctx: Awaited<ReturnType<typeof resetTestDb>>;
const NOW = new Date("2026-10-07T15:00:00Z");

type Item = PromotionExtraction["items"][number];
const item = (over: Partial<Item> = {}): Item => ({
  codeRaw: "134911",
  description: "ARROZ BRANCO PREMIUM 1 kg",
  packText: "1 kg",
  price: 4.95,
  priceUnit: "pct",
  boxPrice: null,
  regularPrice: null,
  priceType: "unit_price",
  minQty: null,
  conditionText: null,
  productExpiryDate: null,
  confidence: 0.95,
  ...over,
});
const promo = (over: Partial<PromotionExtraction> = {}): PromotionExtraction => ({
  title: "Arroz e feijão",
  supplierBrand: "Fritz & Frida",
  offerValidity: { startsOn: null, endsOn: null, evidence: null },
  targetSegmentsHint: ["restaurantes", "lanchonetes"],
  items: [item()],
  ...over,
});
const process = (x: PromotionExtraction) => postProcessPromotion(x, { now: NOW, defaultDays: 7 });

beforeAll(async () => {
  ctx = await resetTestDb();
});
afterAll(closeDb);

let n = 0;
/** JPEG real e único por chamada (o upload gera miniatura). */
const jpeg = (seed: number) =>
  sharp({
    create: { width: 8 + seed, height: 8, channels: 3, background: { r: seed, g: 10, b: 20 } },
  })
    .jpeg()
    .toBuffer();
async function newJob() {
  return createPromotionUpload(ctx.db, ctx.tenantId, {
    buffer: await jpeg(++n),
    filename: `encarte-${n}.jpeg`,
  });
}
const rowsOf = (jobId: string) => importsRepo.listImportRows(ctx.db, ctx.tenantId, jobId);

describe("pós-processamento do encarte (sem IA)", () => {
  it("normaliza código com ponto, preço em centavos e unidade", () => {
    const p = process(
      promo({
        items: [
          item({ codeRaw: "CÓDIGO 134.352", price: 15.99, priceUnit: "un" }),
          item({ codeRaw: "Cód. 134911", price: 4.95, priceUnit: "pct" }),
        ],
      }),
    );
    expect(p.items.map((i) => [i.code, i.priceCents, i.priceUnit])).toEqual([
      ["134352", 1599, "un"],
      ["134911", 495, "pct"],
    ]);
  });

  it("código ambíguo ou ausente nunca vira código e bloqueia como sem vínculo", () => {
    const p = process(
      promo({
        items: [item({ codeRaw: "168.90" }), item({ codeRaw: "94.2" }), item({ codeRaw: null })],
      }),
    );
    expect(p.items.map((i) => i.code)).toEqual([null, null, null]);
    expect(p.items.map((i) => i.ambiguous)).toEqual([true, true, false]);
    for (const i of p.items)
      expect(validatePromotionItem(i)[0]).toMatchObject({
        code: "sem_vinculo",
        severity: "blocking",
      });
  });

  it("validade do produto nunca vira vigência da oferta", () => {
    const p = process(
      promo({
        items: [
          item({
            codeRaw: "108624",
            price: 19.39,
            priceUnit: "kg",
            boxPrice: 193.9,
            priceType: "bundle",
            conditionText: "Compre 2 caixas e ganhe 1",
            productExpiryDate: "14/12/2026",
          }),
        ],
      }),
    );
    expect(p.items[0]).toMatchObject({
      productExpiryDate: "2026-12-14",
      boxPriceCents: 19390,
      priceType: "bundle",
    });
    expect(p.header.usedDefaultDates).toBe(true);
    expect(p.header.startsOn).toBe("2026-10-07");
    expect(p.header.endsOn).toBe("2026-10-14");
    expect(validatePromotionHeader(p.header).map((w) => w.code)).toEqual(["vigencia_padrao"]);
  });

  it("só aceita a vigência quando há trecho impresso como evidência", () => {
    const withEvidence = process(
      promo({
        offerValidity: {
          startsOn: "05/10/2026",
          endsOn: "12/10/2026",
          evidence: "Oferta válida de 05/10 a 12/10",
        },
      }),
    );
    expect(withEvidence.header).toMatchObject({
      startsOn: "2026-10-05",
      endsOn: "2026-10-12",
      usedDefaultDates: false,
      evidence: "Oferta válida de 05/10 a 12/10",
    });
    const noEvidence = process(
      promo({ offerValidity: { startsOn: "05/10/2026", endsOn: "12/10/2026", evidence: null } }),
    );
    expect(noEvidence.header.usedDefaultDates).toBe(true);
    expect(noEvidence.header.endsOn).toBe("2026-10-14");
  });

  it("unidade 'outro' e baixa confiança viram aviso", () => {
    const p = process(promo({ items: [item({ priceUnit: "outro" }), item({ confidence: 0.4 })] }));
    expect(validatePromotionItem(p.items[0]!).map((w) => w.code)).toEqual(["unidade_invalida"]);
    expect(validatePromotionItem(p.items[1]!)).toEqual([
      expect.objectContaining({ code: "baixa_confianca", severity: "warning" }),
    ]);
  });
});

describe("fluxo de importação do encarte", () => {
  it("lê com a IA (SDK falso), mostra a vigência sugerida e confirma criando oferta e produtos novos", async () => {
    const jobId = await newJob();
    const fake = {
      messages: {
        parse: async () => ({
          stop_reason: "end_turn",
          parsed_output: promo({
            items: [
              item({ codeRaw: "134911" }),
              item({
                codeRaw: "134.913",
                description: "ARROZ 5 kg",
                packText: "5 kg",
                price: 21.99,
              }),
            ],
          }),
          content: [],
          usage: { input_tokens: 2000, output_tokens: 500 },
        }),
      },
    };
    await extractPromotion({ db: ctx.db, tenantId: ctx.tenantId, jobId }, fake as never, NOW);
    const job = (await importsRepo.getImportJob(ctx.db, ctx.tenantId, jobId))!;
    expect(job).toMatchObject({ status: "review", inputTokens: 2000 });
    const rows = await rowsOf(jobId);
    expect(rows.map((r) => r.rowType)).toEqual([
      "promotion_header",
      "promotion_item",
      "promotion_item",
    ]);
    expect(rows[1]).toMatchObject({ matchType: "new", status: "accepted" });
    await confirmPromotionImport(ctx.db, ctx.tenantId, jobId, undefined, NOW);

    const list = await promotionsRepo.listPromotions(ctx.db, ctx.tenantId);
    expect(list).toHaveLength(1);
    expect(list[0]!.promotion).toMatchObject({
      name: "Arroz e feijão",
      supplierBrand: "Fritz & Frida",
      startsOn: "2026-10-07",
      endsOn: "2026-10-14",
      status: "active",
    });
    const items = await promotionsRepo.listPromotionItems(
      ctx.db,
      ctx.tenantId,
      list[0]!.promotion.id,
    );
    expect(
      items
        .map((i) => [i.item.rawCode, i.item.priceCents, i.item.priceUnit])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ["134.913", 2199, "pct"],
      ["134911", 495, "pct"],
    ]);
    expect(items.every((i) => i.product?.source === "promotion")).toBe(true);
    expect(items.every((i) => i.product?.listPriceCents === null)).toBe(true);
    expect(items.every((i) => i.product?.brand === "Fritz & Frida")).toBe(true);
  });

  it("preço de oferta não altera o preço de lista de produto existente", async () => {
    await productsRepo.upsertProducts(ctx.db, ctx.tenantId, [
      {
        code: "555555",
        description: "PRODUTO DO CATALOGO",
        source: "catalog",
        listPriceCents: 1000,
        searchText: "555555 PRODUTO DO CATALOGO",
      } as never,
    ]);
    const jobId = await newJob();
    await buildPromotionRows(
      ctx.db,
      ctx.tenantId,
      jobId,
      process(promo({ items: [item({ codeRaw: "555555", price: 7.5 })] })),
    );
    expect((await rowsOf(jobId))[1]!.matchType).toBe("code");
    await confirmPromotionImport(ctx.db, ctx.tenantId, jobId, undefined, NOW);
    const p = (await productsRepo.listProducts(ctx.db, ctx.tenantId, { q: "555555" })).rows[0]!;
    expect(p).toMatchObject({ listPriceCents: 1000, source: "catalog" });
  });

  it("item sem vínculo bloqueia até vincular, criar com código ou rejeitar", async () => {
    const jobId = await newJob();
    await buildPromotionRows(
      ctx.db,
      ctx.tenantId,
      jobId,
      process(
        promo({
          items: [
            item({ codeRaw: "168.90", description: "PRODUTO DO CATALOGO 1 kg" }),
            item({ codeRaw: "94.2", description: "OUTRO PRODUTO" }),
            item({ codeRaw: "169.115", price: 2.99, description: "ITEM OK" }),
          ],
        }),
      ),
    );
    let rows = await rowsOf(jobId);
    expect(rows.map((r) => r.status)).toEqual(["accepted", "pending", "pending", "accepted"]);
    await expect(confirmPromotionImport(ctx.db, ctx.tenantId, jobId)).rejects.toThrow(/pendentes/);

    // 1) vincula à mão a um produto existente
    const existing = (await productsRepo.listProducts(ctx.db, ctx.tenantId, { q: "555555" }))
      .rows[0]!;
    await linkPromotionItem(ctx.db, ctx.tenantId, rows[1]!.id, existing.id);
    // 2) digita o código completo
    await editPromotionItem(ctx.db, ctx.tenantId, rows[2]!.id, { code: "94200" });
    rows = await rowsOf(jobId);
    expect(rows.map((r) => [r.status, r.matchType])).toEqual([
      ["accepted", null],
      ["edited", "description"],
      ["edited", "new"],
      ["accepted", "new"],
    ]);
    await expect(
      setPromotionRowStatus(ctx.db, ctx.tenantId, rows[1]!.id, "rejected"),
    ).resolves.toBeUndefined();
    const { promotionId, items } = await confirmPromotionImport(
      ctx.db,
      ctx.tenantId,
      jobId,
      undefined,
      NOW,
    );
    expect(items).toBe(2);
    const saved = await promotionsRepo.listPromotionItems(ctx.db, ctx.tenantId, promotionId);
    expect(saved.map((i) => i.item.rawCode).sort()).toEqual(["169.115", "94200"]);
  });

  it("vigência editada na revisão vale; fim antes do início bloqueia", async () => {
    const jobId = await newJob();
    await buildPromotionRows(ctx.db, ctx.tenantId, jobId, process(promo()));
    await editPromotionHeader(ctx.db, ctx.tenantId, jobId, {
      startsOn: "2026-10-10",
      endsOn: "2026-10-05",
    });
    let rows = await rowsOf(jobId);
    expect(rows[0]!.status).toBe("pending");
    await expect(confirmPromotionImport(ctx.db, ctx.tenantId, jobId)).rejects.toThrow(/pendentes/);
    await editPromotionHeader(ctx.db, ctx.tenantId, jobId, {
      name: "Encarte da semana",
      startsOn: "2026-10-01",
      endsOn: "2026-10-03",
    });
    rows = await rowsOf(jobId);
    expect(rows[0]!.warnings).toEqual([]);
    await confirmPromotionImport(ctx.db, ctx.tenantId, jobId, undefined, NOW);
    const saved = (await promotionsRepo.listPromotions(ctx.db, ctx.tenantId)).find(
      (p) => p.promotion.name === "Encarte da semana",
    )!;
    // fim anterior a hoje: já nasce vencida
    expect(saved.promotion).toMatchObject({
      startsOn: "2026-10-01",
      endsOn: "2026-10-03",
      status: "expired",
    });
  });

  it("avisa quando o mesmo arquivo já virou encarte", async () => {
    const buffer = await jpeg(200);
    const a = await createPromotionUpload(ctx.db, ctx.tenantId, { buffer, filename: "a.jpeg" });
    await buildPromotionRows(
      ctx.db,
      ctx.tenantId,
      a,
      process(promo({ items: [item({ codeRaw: "555555" })] })),
    );
    await confirmPromotionImport(ctx.db, ctx.tenantId, a, undefined, NOW);
    const b = await createPromotionUpload(ctx.db, ctx.tenantId, { buffer, filename: "b.jpeg" });
    await buildPromotionRows(
      ctx.db,
      ctx.tenantId,
      b,
      process(promo({ items: [item({ codeRaw: "555555" })] })),
    );
    const header = (await rowsOf(b))[0]!;
    expect((header.warnings as { code: string }[]).map((w) => w.code)).toContain(
      "encarte_repetido",
    );
  });
});
