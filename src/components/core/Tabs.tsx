"use client";

import * as RT from "@radix-ui/react-tabs";
import type { ReactNode } from "react";

export interface TabItem {
  value: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

export function Tabs({ items, defaultValue, value, onValueChange }: TabsProps) {
  return (
    <RT.Root
      defaultValue={defaultValue ?? items[0]?.value}
      value={value}
      onValueChange={onValueChange}
      style={{ fontFamily: "var(--cm-font-sans)" }}
    >
      <RT.List
        style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border-1)" }}
        aria-label="Abas"
      >
        {items.map((it) => (
          <RT.Trigger
            key={it.value}
            value={it.value}
            className="data-[state=active]:border-b-brasa data-[state=active]:text-verde-noite focus-visible:shadow-[0_0_0_3px_var(--cm-foco)] data-[state=active]:font-semibold"
            style={{
              height: 44,
              padding: "0 16px",
              background: "transparent",
              border: "none",
              borderBottom: "2px solid transparent",
              fontFamily: "inherit",
              fontSize: 15,
              color: "var(--fg-2)",
              cursor: "pointer",
              outline: "none",
            }}
          >
            {it.label}
          </RT.Trigger>
        ))}
      </RT.List>
      {items.map((it) => (
        <RT.Content key={it.value} value={it.value} style={{ paddingTop: 16 }}>
          {it.content}
        </RT.Content>
      ))}
    </RT.Root>
  );
}
