import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { authenticate } from "@/server/auth/authenticate";
import { verifySessionToken } from "@/server/auth/session";
import { createUser, getUserById } from "@/server/repos/users";
import { closeDb, resetTestDb } from "../helpers/db";

let ctx: Awaited<ReturnType<typeof resetTestDb>>;

beforeAll(async () => {
  ctx = await resetTestDb();
});
afterAll(closeDb);

describe("banco e autenticação", () => {
  it("migrations rodam do zero, com extensões e as 26 tabelas", async () => {
    const tables = await ctx.db.execute(
      sql`select count(*)::int as n from information_schema.tables where table_schema = 'public'`,
    );
    expect(tables.rows[0]!.n).toBe(26);
    const ext = await ctx.db.execute(
      sql`select extname from pg_extension where extname in ('pg_trgm','unaccent')`,
    );
    expect(ext.rows).toHaveLength(2);
    const idx = await ctx.db.execute(
      sql`select indexdef from pg_indexes where indexname = 'products_search_trgm'`,
    );
    expect(String(idx.rows[0]!.indexdef)).toContain("gin_trgm_ops");
  });

  it("seed cria 11 segmentos e 51 aliases", async () => {
    const seg = await ctx.db.execute(sql`select count(*)::int as n from segments`);
    const ali = await ctx.db.execute(sql`select count(*)::int as n from segment_aliases`);
    expect(seg.rows[0]!.n).toBe(11);
    expect(ali.rows[0]!.n).toBe(51);
    const flags = await ctx.db.execute(
      sql`select count(*)::int as n from segments where has_recipes`,
    );
    expect(flags.rows[0]!.n).toBe(7);
  });

  it("seed cria o tenant e as configurações do motor", async () => {
    const rows = await ctx.db.execute(
      sql`select key from settings where tenant_id = ${ctx.tenantId}`,
    );
    expect(rows.rows.map((r) => r.key)).toEqual(["engine"]);
  });

  it("cria usuário e autentica com a senha certa, não com a errada", async () => {
    const user = await createUser(ctx.db, ctx.tenantId, {
      email: "Ricardo@Exemplo.com",
      name: "Ricardo",
      role: "admin",
      password: "senha-correta-123",
    });
    expect(user.email).toBe("ricardo@exemplo.com");
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);

    const ok = await authenticate(ctx.db, "ricardo@exemplo.com", "senha-correta-123");
    expect(ok).not.toBeNull();
    expect(verifySessionToken(ok!.token)).toMatchObject({ uid: user.id, tid: ctx.tenantId });

    expect(await authenticate(ctx.db, "ricardo@exemplo.com", "errada")).toBeNull();
    expect(await authenticate(ctx.db, "naoexiste@exemplo.com", "x")).toBeNull();
  });

  it("repos filtram por tenant", async () => {
    const res = await authenticate(ctx.db, "ricardo@exemplo.com", "senha-correta-123");
    expect(await getUserById(ctx.db, ctx.tenantId, res!.user.id)).not.toBeNull();
    expect(
      await getUserById(ctx.db, "00000000-0000-0000-0000-000000000000", res!.user.id),
    ).toBeNull();
  });
});
