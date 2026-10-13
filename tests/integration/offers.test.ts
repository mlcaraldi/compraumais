import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { products, promotionItems, promotions } from "@/server/db/schema";
import { EXPIRE_CRON, EXPIRE_TZ, QUEUE_EXPIRE, runExpireJob } from "@/server/jobs/handlers";
import { stopQueue } from "@/server/jobs/queue";
import { addDaysIso, todayIso } from "@/server/normalize";
import { promotionsRepo } from "@/server/repos";
import {
  closePromotion,
  PromotionError,
  updatePromotionValidity,
} from "@/server/services/promotions";
import { startWorker } from "../../worker";
import { closeDb, resetTestDb, TEST_DATABASE_URL } from "../helpers/db";

let ctx: Awaited<ReturnType<typeof resetTestDb>>;
const NOW = new Date("2026-10-13T15:00:00Z");
const TODAY = todayIso(NOW);
beforeAll(async () => {
  ctx = await resetTestDb();
});
afterAll(async () => {
  await stopQueue();
  await closeDb();
});

async function promo(name: string, startsOn: string, endsOn: string) {
  const [p] = await ctx.db
    .insert(promotions)
    .values({ tenantId: ctx.tenantId, name, startsOn, endsOn })
    .returning();
  const [prod] = await ctx.db
    .insert(products)
    .values({ tenantId: ctx.tenantId, code: name, description: name })
    .returning();
  await ctx.db.insert(promotionItems).values({
    tenantId: ctx.tenantId,
    promotionId: p!.id,
    productId: prod!.id,
    rawDescription: name,
    priceCents: 1000,
    priceUnit: "un",
  });
  return p!;
}
const active = async () =>
  (await promotionsRepo.listActivePromotionItems(ctx.db, ctx.tenantId, TODAY)).map(
    (r) => r.promotion.name,
  );
const statusOf = async (id: string) =>
  (await promotionsRepo.getPromotion(ctx.db, ctx.tenantId, id))!.status;

describe("ciclo de vida das ofertas", () => {
  it("oferta com fim ontem não entra no motor; o job marca como vencida e não repete", async () => {
    const ontem = await promo("ontem", addDaysIso(TODAY, -10), addDaysIso(TODAY, -1));
    const hoje = await promo("hoje", addDaysIso(TODAY, -3), TODAY);
    const futura = await promo("futura", addDaysIso(TODAY, 1), addDaysIso(TODAY, 8));
    // mesmo antes do job rodar (status ainda "active"), a data já tira a oferta do motor
    expect(await statusOf(ontem.id)).toBe("active");
    expect(await active()).toEqual(["hoje"]);

    expect(await runExpireJob(ctx.db, NOW)).toBe(1);
    expect(await statusOf(ontem.id)).toBe("expired");
    expect(await statusOf(hoje.id)).toBe("active");
    expect(await statusOf(futura.id)).toBe("active");
    expect(await runExpireJob(ctx.db, NOW)).toBe(0);
  });

  it("editar a vigência reativa ou vence a oferta conforme o fim", async () => {
    const p = await promo("editavel", addDaysIso(TODAY, -5), addDaysIso(TODAY, -1));
    await promotionsRepo.updatePromotion(ctx.db, ctx.tenantId, p.id, { status: "expired" });
    await updatePromotionValidity(
      ctx.db,
      ctx.tenantId,
      null,
      p.id,
      { name: "Editável", startsOn: addDaysIso(TODAY, -5), endsOn: addDaysIso(TODAY, 6) },
      NOW,
    );
    expect(await statusOf(p.id)).toBe("active");
    expect(await active()).toContain("Editável");
    await updatePromotionValidity(
      ctx.db,
      ctx.tenantId,
      null,
      p.id,
      { name: "Editável", startsOn: addDaysIso(TODAY, -5), endsOn: addDaysIso(TODAY, -2) },
      NOW,
    );
    expect(await statusOf(p.id)).toBe("expired");
  });

  it("recusa datas inválidas ou fim antes do início", async () => {
    const p = await promo("invalida", TODAY, addDaysIso(TODAY, 3));
    for (const bad of [
      { name: "x", startsOn: "", endsOn: TODAY },
      { name: "x", startsOn: addDaysIso(TODAY, 3), endsOn: TODAY },
      { name: "  ", startsOn: TODAY, endsOn: TODAY },
    ])
      await expect(
        updatePromotionValidity(ctx.db, ctx.tenantId, null, p.id, bad, NOW),
      ).rejects.toBeInstanceOf(PromotionError);
  });

  it("encerrar tira a oferta do motor na hora", async () => {
    const p = await promo("encerrar", addDaysIso(TODAY, -1), addDaysIso(TODAY, 5));
    expect(await active()).toContain("encerrar");
    await closePromotion(ctx.db, ctx.tenantId, null, p.id);
    expect(await statusOf(p.id)).toBe("expired");
    expect(await active()).not.toContain("encerrar");
  });

  it("o worker agenda o job diário às 03:00 no fuso de Brasília", async () => {
    const boss = await startWorker(TEST_DATABASE_URL);
    try {
      const schedules = await boss.getSchedules();
      expect(schedules).toContainEqual(
        expect.objectContaining({ name: QUEUE_EXPIRE, cron: EXPIRE_CRON, timezone: EXPIRE_TZ }),
      );
    } finally {
      await boss.stop({ graceful: false });
    }
  });
});
