export type Pack = {
  /** quantidade de unidades na embalagem (ex.: 20 em "20X400G") */
  qty: number;
  /** tamanho de cada unidade, em g ou ml */
  unitSize?: number;
  unit: "g" | "ml" | "un";
};

const UNIT_RE = "(KG|GRS|GR|G|LTS|LT|ML|L)(?![A-Z])";

function toBase(value: number, unit: string): { size: number; unit: "g" | "ml" } {
  switch (unit) {
    case "KG":
      return { size: value * 1000, unit: "g" };
    case "L":
    case "LT":
    case "LTS":
      return { size: value * 1000, unit: "ml" };
    case "ML":
      return { size: value, unit: "ml" };
    default:
      return { size: value, unit: "g" };
  }
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Extrai a embalagem de descrições e textos. Retorna null se não reconhecer (nunca adivinha). */
export function parsePack(input: string | null | undefined): Pack | null {
  if (!input) return null;
  const t = input
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/(\d),(\d)/g, "$1.$2");

  const multi = t.match(new RegExp(`(\\d+)\\s*X\\s*(\\d+(?:\\.\\d+)?)\\s*${UNIT_RE}`));
  if (multi) {
    const base = toBase(Number(multi[2]), multi[3]!);
    return { qty: Number(multi[1]), unitSize: round(base.size), unit: base.unit };
  }

  const single = t.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${UNIT_RE}`));
  const base = single ? toBase(Number(single[1]), single[2]!) : null;

  const withCount = t.match(/\bC\/\s*(\d+)/) ?? t.match(/\b(\d+)\s*(?:UN|UND|UNID)\b/);
  if (withCount) {
    const qty = Number(withCount[1]);
    return base ? { qty, unitSize: round(base.size), unit: base.unit } : { qty, unit: "un" };
  }

  if (base) return { qty: 1, unitSize: round(base.size), unit: base.unit };
  return null;
}

/** Quantidade total em g/ml/un de uma embalagem, se conhecida. */
export function packTotal(p: Pack | null): number | null {
  if (!p) return null;
  return p.unitSize ? p.qty * p.unitSize : p.unit === "un" ? p.qty : null;
}
