import type { Db } from "../db/client";
import { todayIso } from "../normalize";
import { auditRepo, promotionsRepo } from "../repos";

export class PromotionError extends Error {}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Edita nome e vigência. O status acompanha as datas: fim a partir de hoje deixa a oferta ativa
 * (inclusive reativando uma vencida); fim no passado a deixa vencida. Rascunhos não mudam.
 */
export async function updatePromotionValidity(
  db: Db,
  tenantId: string,
  userId: string | null,
  id: string,
  input: { name: string; startsOn: string; endsOn: string },
  now: Date = new Date(),
) {
  const promo = await promotionsRepo.getPromotion(db, tenantId, id);
  if (!promo) throw new PromotionError("Encarte não encontrado");
  const name = input.name.trim();
  if (!name) throw new PromotionError("Informe o nome do encarte.");
  if (!ISO.test(input.startsOn) || !ISO.test(input.endsOn))
    throw new PromotionError("Informe as datas de início e fim.");
  if (input.endsOn < input.startsOn)
    throw new PromotionError("O fim da oferta não pode ser antes do início.");
  const status =
    promo.status === "draft" ? "draft" : input.endsOn >= todayIso(now) ? "active" : "expired";
  await promotionsRepo.updatePromotion(db, tenantId, id, {
    name,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    status,
  });
  await auditRepo.writeAudit(db, tenantId, {
    userId,
    action: "promotion.update_validity",
    entity: "promotion",
    entityId: id,
    diff: {
      from: { startsOn: promo.startsOn, endsOn: promo.endsOn, status: promo.status },
      to: { startsOn: input.startsOn, endsOn: input.endsOn, status },
    },
  });
}

/** "Encerrar": a oferta deixa de valer agora, sem mexer nas datas impressas no encarte. */
export async function closePromotion(db: Db, tenantId: string, userId: string | null, id: string) {
  const promo = await promotionsRepo.getPromotion(db, tenantId, id);
  if (!promo) throw new PromotionError("Encarte não encontrado");
  await promotionsRepo.updatePromotion(db, tenantId, id, { status: "expired" });
  await auditRepo.writeAudit(db, tenantId, {
    userId,
    action: "promotion.close",
    entity: "promotion",
    entityId: id,
    diff: { from: promo.status },
  });
}
