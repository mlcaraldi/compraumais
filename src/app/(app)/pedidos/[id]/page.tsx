import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/core/Badge";
import { Card } from "@/components/core/Card";
import { AutoRefresh } from "@/components/AutoRefresh";
import { FichaTecnica, type FichaItem } from "@/components/kitchen/FichaTecnica";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { explainReasons, WARNING_TEXT } from "@/server/engine/explain";
import type { EngineWarning, Pendency, Reason } from "@/server/engine/types";
import { formatCents, titleCase } from "@/server/normalize";
import { customersRepo, ordersRepo, recipesRepo, suggestionsRepo } from "@/server/repos";
import { RESULT_LABEL } from "../labels";
import { MessagePanel } from "./message-panel";
import { OutcomeForm } from "./outcome-form";
import { RecalculateForm } from "./recalculate-form";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIT = { un: "un", pct: "pacote", kg: "kg", cx: "caixa" } as Record<string, string>;
const fmtQty = (q: string) => Number(q).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const db = getDb();
  const order = await ordersRepo.getOrder(db, user.tenantId, id);
  if (!order) notFound();
  const customer = (await customersRepo.getCustomerById(db, user.tenantId, order.customerId))!;
  const lines = await ordersRepo.listOrderLines(db, user.tenantId, id);
  const run = await suggestionsRepo.getLatestRun(db, user.tenantId, id);
  const rows = run ? await suggestionsRepo.listRunItems(db, user.tenantId, run.id) : [];
  const message = run ? await suggestionsRepo.getRunMessage(db, user.tenantId, run.id) : null;
  const outcomes = run ? await suggestionsRepo.listRunOutcomes(db, user.tenantId, run.id) : [];
  const meta = (run?.outputMeta ?? {}) as { warnings?: EngineWarning[]; pendencies?: Pendency[] };
  const warnings = meta.warnings ?? [];

  const customerName = titleCase(customer.tradeName) || titleCase(customer.legalName);
  const subtitle = [
    `Pedido ${order.externalNumber}`,
    order.issuedAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    order.totalCents !== null ? formatCents(order.totalCents) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (order.status !== "confirmed") {
    return (
      <>
        <PageHeader title={customerName} subtitle={subtitle} />
        <Card>
          <p style={{ margin: 0 }}>
            Este pedido ainda não foi confirmado. Revise e confirme a importação para gerar as
            sugestões. <Link href="/importacoes">Ir para importações</Link>
          </p>
        </Card>
      </>
    );
  }

  const names = {
    products: Object.fromEntries(
      [...lines.map((l) => l.product), ...rows.map((r) => r.product)]
        .filter((p): p is NonNullable<typeof p> => !!p)
        .map((p) => [p.id, { description: p.description }]),
    ),
    recipes: {} as Record<string, { name: string }>,
  };
  if (rows.length) {
    const ids = new Set(rows.flatMap((r) => r.item.recipeIds));
    for (const rid of ids) {
      const r = await recipesRepo.getRecipe(db, user.tenantId, rid);
      if (r) names.recipes[rid] = { name: r.name };
    }
  }

  const suggestions = rows.filter((r) => r.item.list !== "reminder");
  const reminders = rows.filter((r) => r.item.list === "reminder");

  const fichaItems: FichaItem[] = [
    ...lines.map((l) => ({
      name: titleCase(l.product?.description ?? l.line.rawDescription ?? "Item sem descrição"),
      qty: `${fmtQty(l.line.qty)} ${l.line.unit ? l.line.unit.toLowerCase() : "un"}`,
      status: "ok" as const,
    })),
    ...suggestions.map((r) => {
      const promo = r.item.promotionItemId !== null;
      const price =
        r.item.priceCents === null
          ? "consultar preço"
          : `${formatCents(r.item.priceCents)}${r.item.priceUnit ? `/${UNIT[r.item.priceUnit] ?? r.item.priceUnit}` : ""}`;
      return {
        name: titleCase(r.product.description),
        qty: price,
        status: "missing" as const,
        label: promo ? "+ oferta" : "+ sugerido",
        detail: explainReasons(r.item.reasons as Reason[], names).join(" "),
      };
    }),
  ];

  const messageText = message?.editedText ?? message?.text ?? "";
  const customerWarnings: EngineWarning[] = warnings;

  return (
    <>
      {!run && <AutoRefresh seconds={3} />}
      <PageHeader
        title={customerName}
        subtitle={subtitle}
        actions={
          <RecalculateForm
            orderId={order.id}
            label={run ? "Recalcular sugestões" : "Gerar sugestões"}
          />
        }
      />
      {!run ? (
        <Card>
          <p style={{ margin: 0 }}>
            Gerando as sugestões. A página atualiza sozinha; se demorar, use “Gerar sugestões”.
          </p>
        </Card>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(320px, 1fr) minmax(320px, 1fr)",
            gap: 16,
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
            {customerWarnings.length > 0 && (
              <Card>
                <h2 style={{ fontSize: "var(--text-h3)", margin: "0 0 8px" }}>Avisos</h2>
                <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4, fontSize: 14 }}>
                  {customerWarnings.map((w) => (
                    <li key={w}>{WARNING_TEXT[w]}</li>
                  ))}
                </ul>
              </Card>
            )}
            <FichaTecnica
              dish={`Pedido ${order.externalNumber}`}
              portions={lines.length}
              portionsLabel="linhas"
              items={fichaItems}
            />
            {suggestions.length === 0 && (
              <Card>
                <p style={{ margin: 0, fontSize: 14 }}>
                  Nenhuma sugestão para este pedido. Veja os avisos acima para entender o motivo.
                </p>
              </Card>
            )}
            {reminders.length > 0 && (
              <Card>
                <h2 style={{ fontSize: "var(--text-h3)", margin: "0 0 4px" }}>Lembrar o cliente</h2>
                <p style={{ color: "var(--fg-2)", fontSize: 13, marginTop: 0 }}>
                  Itens que ele compra sempre, ficaram fora do pedido e não têm oferta. Lembre de
                  viva voz, sem preço.
                </p>
                <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4, fontSize: 14 }}>
                  {reminders.map((r) => (
                    <li key={r.item.id}>{titleCase(r.product.description)}</li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
          <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
            {message && (
              <MessagePanel
                key={message.id}
                orderId={order.id}
                messageId={message.id}
                initialText={messageText}
                originalText={message.text}
                phoneE164={customer.phoneE164}
                phoneKind={customer.phoneKind ?? "invalid"}
                hasItems={suggestions.length > 0}
              />
            )}
            <OutcomeForm
              orderId={order.id}
              disabled={false}
              items={suggestions.map((r) => ({
                productId: r.item.productId,
                name: titleCase(r.product.description),
              }))}
            />
            {outcomes.length > 0 && (
              <Card>
                <h2 style={{ fontSize: "var(--text-h3)", margin: "0 0 8px" }}>
                  Resultados registrados
                </h2>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                  {outcomes.map((o) => (
                    <li key={o.id} style={{ fontSize: 14, display: "flex", gap: 8 }}>
                      <Badge tone={o.result === "accepted" ? "success-soft" : "outline"}>
                        {RESULT_LABEL[o.result] ?? o.result}
                      </Badge>
                      <span style={{ color: "var(--fg-2)" }}>
                        {o.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                        {o.note ? ` · ${o.note}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}
