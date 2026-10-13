/** Data de hoje em Brasília, "AAAA-MM-DD". Recebe `now` para ser testável. */
export function todayIso(now: Date): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

/** Soma dias a uma data "AAAA-MM-DD". */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "AAAA-MM-DD" -> "dd/mm/aaaa" */
export function formatIsoBr(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** "AAAA-MM-DD" -> "dd/mm" */
export function formatIsoShort(iso: string | null | undefined): string {
  return formatIsoBr(iso).slice(0, 5);
}
