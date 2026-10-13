import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OrderExtraction } from "@/server/importers/ai/schemas";
import {
  postProcessOrder,
  validateOrderHeader,
  validateOrderLine,
} from "@/server/importers/order/postprocess";
import {
  buildOrderRows,
  confirmOrderImport,
  createOrderUpload,
  createTypedOrder,
  editOrderLine,
  extractOrder,
  setOrderCustomer,
  setOrderRowStatus,
} from "@/server/services/import-order";
import { customersRepo, importsRepo, ordersRepo, productsRepo } from "@/server/repos";
import { runExtractJob } from "@/server/jobs/handlers";
import { closeDb, resetTestDb } from "../helpers/db";

let ctx: Awaited<ReturnType<typeof resetTestDb>>;
let customerId: string;

const extraction = (over: Partial<OrderExtraction> = {}): OrderExtraction => ({
  orderNumber: "2707401471",
  issuedAt: "02/07/2026",
  customer: { code: null, document: "11.222.333/0001-81", name: "CAFE UM LTDA" },
  repCode: "2707",
  paymentTerms: "28 dias",
  total: 134.7,
  lines: [
    {
      code: "166225",
      description: "VG VAGEM 2KG CG CONFRESCOR",
      unit: "QUILO",
      qty: 2,
      unitPrice: 16.64,
      lineTotal: 33.28,
      confidence: 0.99,
    },
    {
      code: "108576",
      description: "VG GRAO DE BICO 1KG CG GRANO",
      unit: "UNIDADE",
      qty: 2,
      unitPrice: 27.94,
      lineTotal: 55.88,
      confidence: 0.98,
    },
    {
      code: "110647",
      description: "AMIDO DE MILHO PCT 5KG NUANCE",
      unit: "UNIDADE",
      qty: 1,
      unitPrice: 45.54,
      lineTotal: 45.54,
      confidence: 0.97,
    },
  ],
  ...over,
});

beforeAll(async () => {
  ctx = await resetTestDb();
  await customersRepo.upsertCustomers(ctx.db, ctx.tenantId, [
    {
      externalCode: "C1",
      document: "11222333000181",
      legalName: "CAFE UM LTDA",
      tradeName: "Cafe Um",
    } as never,
  ]);
  customerId = (await customersRepo.listCustomers(ctx.db, ctx.tenantId, {})).rows[0]!.id;
});
afterAll(closeDb);

async function newJob(name = "pedido.pdf", bytes = "pdf-bytes") {
  return createOrderUpload(ctx.db, ctx.tenantId, {
    buffer: Buffer.from(bytes + name),
    filename: name,
  });
}

describe("pós-processamento do pedido (sem IA)", () => {
  it("normaliza código, centavos e data", () => {
    const p = postProcessOrder(extraction());
    expect(p.header).toMatchObject({
      orderNumber: "2707401471",
      issuedAt: "2026-07-02",
      totalCents: 13470,
      repCode: "2707",
    });
    expect(p.lines.map((l) => [l.code, l.qty, l.unitPriceCents, l.lineTotalCents])).toEqual([
      ["166225", 2, 1664, 3328],
      ["108576", 2, 2794, 5588],
      ["110647", 1, 4554, 4554],
    ]);
    expect(validateOrderHeader(p.header, p.lines)).toEqual([]);
    expect(p.lines.flatMap(validateOrderLine)).toEqual([]);
  });

  it("avisa quando a soma ou a conta da linha não bate e quando o código é ambíguo", () => {
    const p = postProcessOrder(
      extraction({
        total: 140,
        lines: [
          { ...extraction().lines[0]!, lineTotal: 40 },
          { ...extraction().lines[1]!, code: "168.90" },
        ],
      }),
    );
    expect(validateOrderHeader(p.header, p.lines).map((w) => w.code)).toEqual(["soma_divergente"]);
    expect(validateOrderLine(p.lines[0]!).map((w) => w.code)).toEqual(["conta_divergente"]);
    const amb = validateOrderLine(p.lines[1]!);
    expect(amb).toHaveLength(1);
    expect(amb[0]).toMatchObject({ code: "codigo_invalido", severity: "blocking" });
    expect(p.lines[1]!.code).toBeNull();
  });

  it("avisa leitura de baixa confiança sem bloquear", () => {
    const w = validateOrderLine(
      postProcessOrder(extraction({ lines: [{ ...extraction().lines[0]!, confidence: 0.5 }] }))
        .lines[0]!,
    );
    expect(w).toEqual([expect.objectContaining({ code: "baixa_confianca", severity: "warning" })]);
  });
});

describe("fluxo de importação do pedido", () => {
  it("lê com a IA (SDK falso), vincula o cliente por CNPJ e confirma criando pedido e produtos", async () => {
    const jobId = await newJob("a.pdf");
    const fakeClient = {
      messages: {
        parse: async () => ({
          stop_reason: "end_turn",
          parsed_output: extraction(),
          content: [],
          usage: { input_tokens: 1000, output_tokens: 200 },
        }),
      },
    };
    await extractOrder({ db: ctx.db, tenantId: ctx.tenantId, jobId }, fakeClient as never);

    const job = (await importsRepo.getImportJob(ctx.db, ctx.tenantId, jobId))!;
    expect(job.status).toBe("review");
    expect(job.inputTokens).toBe(1000);
    expect(Number(job.costCentsEstimate)).toBeGreaterThan(0);
    const rows = await importsRepo.listImportRows(ctx.db, ctx.tenantId, jobId);
    expect(rows.map((r) => [r.rowType, r.status])).toEqual([
      ["order_header", "accepted"],
      ["order_line", "accepted"],
      ["order_line", "accepted"],
      ["order_line", "accepted"],
    ]);
    expect(rows[0]!.matchId).toBe(customerId);
    expect(rows.slice(1).every((r) => r.matchType === "new")).toBe(true);

    const { orderId } = await confirmOrderImport(ctx.db, ctx.tenantId, jobId);
    const order = (await ordersRepo.getOrder(ctx.db, ctx.tenantId, orderId))!;
    expect(order).toMatchObject({
      externalNumber: "2707401471",
      status: "confirmed",
      totalCents: 13470,
      customerId,
    });
    const lines = await ordersRepo.listOrderLines(ctx.db, ctx.tenantId, orderId);
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.product?.source === "order")).toBe(true);
    expect(lines.every((l) => l.product?.listPriceCents === null)).toBe(true);
    expect(lines[0]!.line.totalCents).toBe(3328);
    expect((await importsRepo.getImportJob(ctx.db, ctx.tenantId, jobId))!.status).toBe("done");
  });

  it("não deixa importar o mesmo número de pedido duas vezes", async () => {
    const jobId = await newJob("b.pdf");
    await buildOrderRows(ctx.db, ctx.tenantId, jobId, postProcessOrder(extraction()));
    const header = (await importsRepo.listImportRows(ctx.db, ctx.tenantId, jobId))[0]!;
    expect(header.status).toBe("pending");
    expect((header.warnings as { code: string }[]).map((w) => w.code)).toContain(
      "pedido_duplicado",
    );
    await expect(confirmOrderImport(ctx.db, ctx.tenantId, jobId)).rejects.toThrow(/pendentes/);
  });

  it("pede o cliente quando não há CNPJ nem código, sugere por nome e permite vincular", async () => {
    const jobId = await newJob("c.pdf");
    const p = postProcessOrder(
      extraction({
        orderNumber: "999",
        customer: { code: null, document: null, name: "Cafe Um" },
      }),
    );
    await buildOrderRows(ctx.db, ctx.tenantId, jobId, p);
    let rows = await importsRepo.listImportRows(ctx.db, ctx.tenantId, jobId);
    expect(rows[0]!.status).toBe("pending");
    const data = rows[0]!.data as { suggestions: { id: string }[]; customerId: string | null };
    expect(data.customerId).toBeNull();
    expect(data.suggestions[0]!.id).toBe(customerId);
    await setOrderCustomer(ctx.db, ctx.tenantId, jobId, { code: "C1" });
    rows = await importsRepo.listImportRows(ctx.db, ctx.tenantId, jobId);
    expect(rows[0]!.status).toBe("edited");
    expect(rows[0]!.matchId).toBe(customerId);
  });

  it("código ambíguo bloqueia até corrigir ou rejeitar a linha", async () => {
    const jobId = await newJob("d.pdf");
    const base = extraction({ orderNumber: "1000" });
    const p = postProcessOrder({
      ...base,
      lines: [{ ...base.lines[0]!, code: "168.90" }, base.lines[1]!],
      total: null,
    });
    await buildOrderRows(ctx.db, ctx.tenantId, jobId, p);
    let rows = await importsRepo.listImportRows(ctx.db, ctx.tenantId, jobId);
    expect(rows[1]!.status).toBe("pending");
    await expect(confirmOrderImport(ctx.db, ctx.tenantId, jobId)).rejects.toThrow(/pendentes/);
    await expect(setOrderRowStatus(ctx.db, ctx.tenantId, rows[1]!.id, "accepted")).rejects.toThrow(
      /pendência/,
    );
    await editOrderLine(ctx.db, ctx.tenantId, rows[1]!.id, { code: "168900" });
    rows = await importsRepo.listImportRows(ctx.db, ctx.tenantId, jobId);
    expect(rows[1]!.status).toBe("edited");
    expect(rows[1]!.matchType).toBe("new");
    const { orderId } = await confirmOrderImport(ctx.db, ctx.tenantId, jobId);
    expect(await ordersRepo.listOrderLines(ctx.db, ctx.tenantId, orderId)).toHaveLength(2);
  });

  it("linha rejeitada não entra no pedido nem conta na soma", async () => {
    const jobId = await newJob("e.pdf");
    const base = extraction({ orderNumber: "1001", total: 89.16 });
    await buildOrderRows(ctx.db, ctx.tenantId, jobId, postProcessOrder(base));
    let rows = await importsRepo.listImportRows(ctx.db, ctx.tenantId, jobId);
    expect((rows[0]!.warnings as { code: string }[]).map((w) => w.code)).toEqual([
      "soma_divergente",
    ]);
    await setOrderRowStatus(ctx.db, ctx.tenantId, rows[3]!.id, "rejected");
    rows = await importsRepo.listImportRows(ctx.db, ctx.tenantId, jobId);
    expect(rows[0]!.warnings).toEqual([]);
    const { orderId } = await confirmOrderImport(ctx.db, ctx.tenantId, jobId);
    expect(await ordersRepo.listOrderLines(ctx.db, ctx.tenantId, orderId)).toHaveLength(2);
  });

  it("produto que já existe é vinculado pelo código e não é sobrescrito", async () => {
    await productsRepo.upsertProducts(ctx.db, ctx.tenantId, [
      {
        code: "777777",
        description: "PRODUTO DO CATALOGO",
        source: "catalog",
        listPriceCents: 1000,
        searchText: "777777 PRODUTO DO CATALOGO",
      } as never,
    ]);
    const jobId = await newJob("f.pdf");
    const base = extraction({ orderNumber: "1002", total: null });
    await buildOrderRows(
      ctx.db,
      ctx.tenantId,
      jobId,
      postProcessOrder({
        ...base,
        lines: [{ ...base.lines[0]!, code: "777777", description: "OUTRO NOME" }],
      }),
    );
    const rows = await importsRepo.listImportRows(ctx.db, ctx.tenantId, jobId);
    expect(rows[1]!.matchType).toBe("code");
    await confirmOrderImport(ctx.db, ctx.tenantId, jobId);
    const p = (await productsRepo.listProducts(ctx.db, ctx.tenantId, { q: "777777" })).rows[0]!;
    expect(p).toMatchObject({
      description: "PRODUTO DO CATALOGO",
      source: "catalog",
      listPriceCents: 1000,
    });
  });
});

describe("digitar pedido (sem IA)", () => {
  it("confirma na hora quando está tudo certo", async () => {
    const r = await createTypedOrder(ctx.db, ctx.tenantId, {
      customerId,
      orderNumber: "DIG-1",
      issuedAt: "2026-07-03",
      lines: [
        { code: "777777", qty: 3, unitPriceCents: 950 },
        { code: "888888", qty: 1, unitPriceCents: 2000, description: "ITEM NOVO 1KG" },
      ],
    });
    expect(r.orderId).toBeTruthy();
    const lines = await ordersRepo.listOrderLines(ctx.db, ctx.tenantId, r.orderId!);
    expect(lines.map((l) => [l.line.rawCode, l.line.qty, l.line.totalCents])).toEqual([
      ["777777", "3", 2850],
      ["888888", "1", 2000],
    ]);
    expect(lines.find((l) => l.line.rawCode === "888888")!.product).toMatchObject({
      source: "order",
      description: "ITEM NOVO 1KG",
    });
  });

  it("vai para revisão quando falta descrição de código novo", async () => {
    const r = await createTypedOrder(ctx.db, ctx.tenantId, {
      customerId,
      orderNumber: "DIG-2",
      issuedAt: "2026-07-03",
      lines: [{ code: "999999", qty: 1, unitPriceCents: 100 }],
    });
    expect(r.orderId).toBeNull();
    const rows = await importsRepo.listImportRows(ctx.db, ctx.tenantId, r.jobId);
    expect(rows[1]!.status).toBe("pending");
  });
});

describe("runExtractJob com o extrator padrão de pedido", () => {
  it("uma imagem inválida vira falha definitiva com mensagem", async () => {
    const jobId = await createOrderUpload(ctx.db, ctx.tenantId, {
      buffer: Buffer.from("texto qualquer"),
      filename: "x.txt",
    });
    await runExtractJob(ctx.db, { tenantId: ctx.tenantId, jobId });
    const job = (await importsRepo.getImportJob(ctx.db, ctx.tenantId, jobId))!;
    expect(job.status).toBe("failed");
    expect(job.error).toMatch(/PDF ou imagem/);
  });
});
