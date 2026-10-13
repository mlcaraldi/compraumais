"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate } from "@/server/auth/authenticate";
import { loginLimiter } from "@/server/auth/rate-limit";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/server/auth/session";
import { getDb } from "@/server/db/client";

export type LoginState = { error?: string; email?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!loginLimiter.allow(ip)) {
    return {
      error: "Muitas tentativas. Aguarde um minuto e tente de novo.",
      email: String(formData.get("email") ?? ""),
    };
  }
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const result = await authenticate(getDb(), email, password);
  if (!result) return { error: "E-mail ou senha incorretos.", email };
  const store = await cookies();
  store.set(SESSION_COOKIE, result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  redirect("/pedidos");
}

export async function logoutAction() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
