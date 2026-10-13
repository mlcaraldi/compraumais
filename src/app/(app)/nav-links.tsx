"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV_ITEMS = [
  { href: "/pedidos", label: "Pedidos" },
  { href: "/clientes", label: "Clientes" },
  { href: "/receitas", label: "Receitas" },
  { href: "/produtos", label: "Produtos" },
  { href: "/ofertas", label: "Ofertas" },
  { href: "/importacoes", label: "Importações" },
  { href: "/painel", label: "Painel" },
  { href: "/configuracoes", label: "Configurações" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            style={{
              display: "block",
              padding: "10px 12px",
              borderRadius: "var(--radius-md)",
              fontSize: 15,
              fontWeight: active ? 600 : 400,
              background: active ? "var(--surface-inverse-2)" : "transparent",
              color: active ? "var(--fg-accent-on-dark)" : "var(--fg-inverse-1)",
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
