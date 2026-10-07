import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/core/Button";
import { requireUser } from "@/server/auth/current-user";
import { logoutAction } from "../(auth)/login/actions";
import { NavLinks } from "./nav-links";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: 240,
          flex: "none",
          background: "var(--surface-inverse)",
          color: "var(--fg-inverse-1)",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        <Logo tone="dark" size={32} />
        <NavLinks />
        <div style={{ marginTop: "auto", fontSize: 14, color: "var(--fg-inverse-2)" }}>
          <div style={{ marginBottom: 8 }}>{user.name}</div>
          <form action={logoutAction}>
            <Button type="submit" variant="secondary" onDark size="sm">
              Sair
            </Button>
          </form>
        </div>
      </aside>
      <main style={{ flex: 1, minWidth: 0, padding: 32, maxWidth: 1240 }}>{children}</main>
    </div>
  );
}
