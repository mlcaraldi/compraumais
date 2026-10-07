import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "@/server/auth/session";
import { createRateLimiter } from "@/server/auth/rate-limit";

describe("sessão assinada", () => {
  const now = new Date("2026-10-07T12:00:00Z");

  it("valida um token recém-criado", () => {
    const token = createSessionToken("u1", "t1", now);
    expect(verifySessionToken(token, now)).toMatchObject({ uid: "u1", tid: "t1" });
  });

  it("rejeita token adulterado, expirado ou vazio", () => {
    const token = createSessionToken("u1", "t1", now);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ uid: "admin", tid: "t1", exp: 9999999999 }),
    ).toString("base64url");
    expect(verifySessionToken(`${forged}.${sig}`, now)).toBeNull();
    expect(verifySessionToken(`${body}.x${sig}`, now)).toBeNull();
    expect(verifySessionToken(token, new Date("2026-10-20T00:00:00Z"))).toBeNull();
    expect(verifySessionToken(undefined, now)).toBeNull();
    expect(verifySessionToken("lixo", now)).toBeNull();
  });
});

describe("limite de tentativas de login", () => {
  it("permite 5 por minuto por chave", () => {
    const rl = createRateLimiter(5, 60_000);
    for (let i = 0; i < 5; i++) expect(rl.allow("ip", 1000 + i)).toBe(true);
    expect(rl.allow("ip", 2000)).toBe(false);
    expect(rl.allow("outro", 2000)).toBe(true);
    expect(rl.allow("ip", 70_000)).toBe(true);
  });
});
