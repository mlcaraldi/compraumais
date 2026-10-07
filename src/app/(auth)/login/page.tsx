import { LoginForm } from "./login-form";
import { Logo } from "@/components/brand/Logo";

export default function LoginPage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ width: "min(400px, 100%)", display: "flex", flexDirection: "column", gap: 24 }}>
        <Logo size={40} />
        <LoginForm />
      </div>
    </main>
  );
}
