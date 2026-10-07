"use client";

import { useActionState } from "react";
import { Button } from "@/components/core/Button";
import { Card } from "@/components/core/Card";
import { Input } from "@/components/core/Input";
import { loginAction, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <Card elevated>
      <form action={action} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 style={{ fontSize: "var(--text-h3)", lineHeight: "var(--lh-h3)", margin: 0 }}>
          Entrar
        </h1>
        <Input
          label="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.email}
          required
        />
        <Input
          label="Senha"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          error={state.error}
        />
        <Button type="submit" disabled={pending} block>
          {pending ? "Entrando..." : "Entrar"}
        </Button>
      </form>
    </Card>
  );
}
