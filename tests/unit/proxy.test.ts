import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";
import { SESSION_COOKIE, createSessionToken } from "@/server/auth/session";

describe("proxy de autenticação", () => {
  it("redireciona rota protegida sem sessão para /login", () => {
    const res = proxy(new NextRequest("http://localhost/pedidos"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("deixa passar com sessão válida", () => {
    const req = new NextRequest("http://localhost/pedidos", {
      headers: { cookie: `${SESSION_COOKIE}=${createSessionToken("u", "t")}` },
    });
    expect(proxy(req).headers.get("location")).toBeNull();
  });
});
