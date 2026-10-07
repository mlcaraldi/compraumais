"use client";

import * as RT from "@radix-ui/react-toast";
import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

type ToastTone = "success" | "error" | "info";
interface ToastMsg {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

const ToastCtx = createContext<(t: Omit<ToastMsg, "id" | "tone"> & { tone?: ToastTone }) => void>(
  () => {},
);

export function useToast() {
  return useContext(ToastCtx);
}

const TONE_COLOR: Record<ToastTone, string> = {
  success: "var(--cm-manjericao-claro)",
  error: "var(--cm-brasa)",
  info: "var(--fg-inverse-1)",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastMsg[]>([]);
  const push = useCallback((t: Omit<ToastMsg, "id" | "tone"> & { tone?: ToastTone }) => {
    setItems((cur) => [...cur, { id: Date.now() + Math.random(), tone: t.tone ?? "info", ...t }]);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      <RT.Provider duration={5000}>
        {children}
        {items.map((t) => (
          <RT.Root
            key={t.id}
            onOpenChange={(open) => {
              if (!open) setItems((cur) => cur.filter((x) => x.id !== t.id));
            }}
            style={{
              background: "var(--surface-inverse)",
              color: "var(--fg-inverse-1)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-on-dark)",
              padding: "12px 16px",
              boxShadow: "var(--shadow-float)",
              fontFamily: "var(--cm-font-sans)",
            }}
          >
            <RT.Title style={{ fontWeight: 600, fontSize: 15, color: TONE_COLOR[t.tone] }}>
              {t.title}
            </RT.Title>
            {t.description && (
              <RT.Description
                style={{ fontSize: 14, color: "var(--cm-sobre-escuro-1)", marginTop: 4 }}
              >
                {t.description}
              </RT.Description>
            )}
          </RT.Root>
        ))}
        <RT.Viewport
          style={{
            position: "fixed",
            bottom: 16,
            right: 16,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            width: "min(360px, calc(100vw - 32px))",
            zIndex: 70,
            listStyle: "none",
            margin: 0,
            padding: 0,
          }}
        />
      </RT.Provider>
    </ToastCtx.Provider>
  );
}
