/** Serial do Excel (base 1899-12-30) -> "AAAA-MM-DD". */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function iso(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/**
 * "dd/mm/aaaa" ou "dd/mm" -> "AAAA-MM-DD". Sem ano: ano corrente, ou o próximo
 * se a data já passou há mais de 6 meses.
 */
export function parseBrDate(
  input: string | null | undefined,
  today: Date = new Date(),
): string | null {
  if (!input) return null;
  const m = input.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (m[3]) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return iso(y, month, day);
  }
  const year = today.getUTCFullYear();
  const thisYear = iso(year, month, day);
  if (!thisYear) return null;
  const sixMonthsAgo = new Date(today);
  sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6);
  return new Date(`${thisYear}T00:00:00Z`) < sixMonthsAgo ? iso(year + 1, month, day) : thisYear;
}
