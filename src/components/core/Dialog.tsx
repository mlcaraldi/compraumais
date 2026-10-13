"use client";

import * as RD from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

export interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}

export function Dialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
}: DialogProps) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <RD.Trigger asChild>{trigger}</RD.Trigger>}
      <RD.Portal>
        <RD.Overlay
          style={{ position: "fixed", inset: 0, background: "var(--cm-overlay)", zIndex: 50 }}
        />
        <RD.Content
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(520px, calc(100vw - 32px))",
            maxHeight: "85vh",
            overflowY: "auto",
            background: "var(--surface-card)",
            border: "1px solid var(--border-1)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-float)",
            padding: 24,
            zIndex: 51,
            color: "var(--fg-1)",
          }}
        >
          <RD.Title
            style={{
              fontFamily: "var(--cm-font-display)",
              fontSize: "var(--text-h3)",
              fontWeight: 600,
              margin: 0,
            }}
          >
            {title}
          </RD.Title>
          {description ? (
            <RD.Description style={{ color: "var(--fg-2)", fontSize: 14, marginTop: 6 }}>
              {description}
            </RD.Description>
          ) : (
            <RD.Description className="sr-only">{title}</RD.Description>
          )}
          <div style={{ marginTop: 16 }}>{children}</div>
          {footer && (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
              {footer}
            </div>
          )}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

export const DialogClose = RD.Close;
