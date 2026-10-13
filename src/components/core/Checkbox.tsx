"use client";

import * as RC from "@radix-ui/react-checkbox";
import { useId } from "react";

export interface CheckboxProps {
  label: string;
  checked?: boolean | "indeterminate";
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean | "indeterminate") => void;
  name?: string;
  disabled?: boolean;
}

export function Checkbox({ label, ...rest }: CheckboxProps) {
  const id = useId();
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--cm-font-sans)" }}
    >
      <RC.Root
        id={id}
        className="data-[state=checked]:bg-verde-noite focus-visible:shadow-[0_0_0_3px_var(--cm-foco)] data-[disabled]:opacity-45"
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          border: "1px solid var(--fg-1)",
          background: "var(--surface-card)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          cursor: "pointer",
          outline: "none",
        }}
        {...rest}
      >
        <RC.Indicator style={{ color: "var(--fg-inverse-1)", fontSize: 14, lineHeight: 1 }}>
          ✓
        </RC.Indicator>
      </RC.Root>
      <label htmlFor={id} style={{ fontSize: 15, color: "var(--fg-1)", cursor: "pointer" }}>
        {label}
      </label>
    </div>
  );
}
