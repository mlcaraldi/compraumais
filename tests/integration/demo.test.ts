import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_ORDER_NUMBER, seedDemoWorld } from "@/server/demo/seed-demo";
import { ordersRepo, suggestionsRepo } from "@/server/repos";
import { runImport } from "@/server/services/cli-import";
import { closeDb, resetTestDb } from "../helpers/db";

let ctx: Awaited<ReturnType<typeof resetTestDb>>;
beforeAll(async () => {
  ctx = await resetTestDb();
});
afterAll(closeDb);

const HEAD =
  "aba,receita,ingrediente,qtd_por_porcao,unidade,embalagem_g_ml,preco_embalagem_rs,custo_porcao_rs";
const SYNTHETIC = [
  HEAD,
  "A,Sanduíche Australiano Defumado,Pão Australiano Faz e Forno,0.075,kg,1000,26.1,1.96",
  "A,Sanduíche Australiano Defumado,Molho Grill Zafran,0.02,kg,1000,41.7,0.83",
  "A,Sanduíche Australiano Defumado,Presunto (2 Fatias),0.04,kg,1000,32.7,1.31",
  "A,Sanduíche Australiano Defumado,Queijo (1 Fatia),0.02,kg,1000,51.2,1.02",
  "A,Sanduíche Australiano Defumado,Alface,0.005,kg,1000,59.9,0.3",
  "B,Capuccino dos Deuses,Nescafé Capuccino Alpino,0.14,ml,1000,44.6,6.25",
  "B,Capuccino dos Deuses,Chef & Co Chantilly,0.025,kg,1000,16.1,0.4",
].join("\n");

async function demoFrom(csvPath: string) {
  const r = await runImport(ctx.db, ctx.tenantId, {
    kind: "recipes",
    file: csvPath,
    autoConfirm: true,
  });
  expect(r.outcome).toBe("confirmed");
  const now = new Date();
  const demo = await seedDemoWorld(ctx.db, ctx.tenantId, now);
  const order = (await ordersRepo.getOrder(ctx.db, ctx.tenantId, demo.orderId))!;
  expect(order.externalNumber).toBe(DEMO_ORDER_NUMBER);
  const run = (await suggestionsRepo.getLatestRun(ctx.db, ctx.tenantId, demo.orderId))!;
  const rows = await suggestionsRepo.listRunItems(ctx.db, ctx.tenantId, run.id);
  const message = await suggestionsRepo.getRunMessage(ctx.db, ctx.tenantId, run.id);
  return { rows, message: message!.text, run };
}

describe("mundo da demo", () => {
  it("com receitas sintéticas: sugere molho em oferta e presunto, e lembra itens do hábito", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "cm-demo-")), "receitas.csv");
    writeFileSync(file, SYNTHETIC);
    const { rows, message } = await demoFrom(file);
    const suggested = rows.filter((r) => r.item.list !== "reminder");
    expect(suggested.length).toBeGreaterThanOrEqual(2);
    const names = suggested.map((r) => r.product.description);
    expect(names.some((n) => /MOLHO GRILL/.test(n))).toBe(true);
    expect(names.some((n) => /PRESUNTO/.test(n))).toBe(true);
    // molho em oferta a 85% do preço de lista, nunca um desconto inventado
    const molho = suggested.find((r) => /MOLHO GRILL/.test(r.product.description))!;
    expect(molho.item.priceCents).toBe(Math.round(4170 * 0.85));
    expect(molho.item.promotionItemId).not.toBeNull();
    expect(
      rows.some((r) => r.item.list === "reminder" && /QUEIJO/.test(r.product.description)),
    ).toBe(true);
    expect(message).toMatch(/^Oi, Marina! Recebi seu pedido de hoje\./);
  });
});

describe("demo com as 9 receitas reais", () => {
  const real = "data/real/receitas_normalizadas.csv";
  it.skipIf(!existsSync(real))("gera sugestões para o pedido da demo", async () => {
    ctx = await resetTestDb();
    const { rows } = await demoFrom(real);
    expect(rows.filter((r) => r.item.list !== "reminder").length).toBeGreaterThanOrEqual(2);
  });
  if (!existsSync(real))
    it("aviso", () => console.warn(`AVISO: ${real} ausente; teste da demo real foi pulado.`));
});
