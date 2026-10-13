import { getCurrentUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { dashboardCsv, getDashboard, resolvePeriod } from "@/server/services/dashboard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Não autorizado", { status: 401 });
  const url = new URL(req.url);
  const period = resolvePeriod(
    url.searchParams.get("from") ?? undefined,
    url.searchParams.get("to") ?? undefined,
  );
  const csv = dashboardCsv(await getDashboard(getDb(), user.tenantId, period));
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="compramais-${period.from}-a-${period.to}.csv"`,
    },
  });
}
