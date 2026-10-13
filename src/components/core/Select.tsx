"use client";

import * as RS from "@radix-ui/react-select";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label?: string;
  placeholder?: string;
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
}

export function Select({
  label,
  placeholder = "Selecione",
  options,
  value,
  defaultValue,
  onValueChange,
  name,
  disabled,
}: SelectProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        fontFamily: "var(--cm-font-sans)",
      }}
    >
      {label && (
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-1)" }}>{label}</span>
      )}
      <RS.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        name={name}
        disabled={disabled}
      >
        <RS.Trigger
          aria-label={label ?? placeholder}
          className="focus-visible:border-verde-noite focus-visible:shadow-[0_0_0_3px_var(--cm-foco)] data-[disabled]:opacity-45"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            height: 44,
            padding: "0 14px",
            background: "var(--surface-card)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius-md)",
            fontFamily: "inherit",
            fontSize: 16,
            color: "var(--fg-1)",
            outline: "none",
            minWidth: 180,
          }}
        >
          <RS.Value placeholder={placeholder} />
          <RS.Icon style={{ color: "var(--fg-2)" }}>▾</RS.Icon>
        </RS.Trigger>
        <RS.Portal>
          <RS.Content
            position="popper"
            sideOffset={4}
            style={{
              background: "var(--surface-card)",
              border: "1px solid var(--border-1)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-card)",
              zIndex: 60,
              minWidth: "var(--radix-select-trigger-width)",
              maxHeight: 320,
              overflow: "hidden",
            }}
          >
            <RS.Viewport style={{ padding: 4 }}>
              {options.map((o) => (
                <RS.Item
                  key={o.value}
                  value={o.value}
                  className="data-[highlighted]:bg-linho"
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--radius-sm)",
                    fontSize: 15,
                    color: "var(--fg-1)",
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  <RS.ItemText>{o.label}</RS.ItemText>
                </RS.Item>
              ))}
            </RS.Viewport>
          </RS.Content>
        </RS.Portal>
      </RS.Root>
    </div>
  );
}
