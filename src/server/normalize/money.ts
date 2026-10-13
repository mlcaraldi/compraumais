/**
 * "R$ 1.234,56", "1234,56", "19,39", "R$19,39/kg", "4.95" -> número com 2 casas.
 * Retorna null se não houver número.
 */
export function parseMoney(input: string | number | null | undefined): number | null {
  if (typeof input === "number")
    return Number.isFinite(input) ? Math.round(input * 100) / 100 : null;
  if (!input) return null;
  const m = String(input).match(/\d[\d.,]*/);
  if (!m) return null;
  let s = m[0].replace(/[.,]+$/, "");
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Dinheiro sempre em centavos inteiros no banco. */
export function parseMoneyCents(input: string | number | null | undefined): number | null {
  const n = parseMoney(input);
  return n === null ? null : Math.round(n * 100);
}

/** 123456 -> "R$ 1.234,56" */
export function formatCents(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const reais = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const cc = String(abs % 100).padStart(2, "0");
  return `${neg ? "-" : ""}R$ ${reais},${cc}`;
}
