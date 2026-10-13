"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Atualiza a página a cada `seconds` enquanto algo está sendo processado em segundo plano. */
export function AutoRefresh({ seconds = 3 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
