import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { readDocument } from "@/server/storage/documents";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ sha: string }> }) {
  const session = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return new NextResponse("Não autorizado", { status: 401 });
  const { sha } = await ctx.params;
  if (!/^[0-9a-f]{64}$/.test(sha)) return new NextResponse("Não encontrado", { status: 404 });
  const thumb = new URL(request.url).searchParams.get("thumb") === "1";
  const file = await readDocument(getDb(), session.tid, sha, thumb);
  if (!file) return new NextResponse("Não encontrado", { status: 404 });
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": thumb ? "image/jpeg" : file.document.mime,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.document.filename)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
