export type DocumentResult = {
  digits: string;
  kind: "cpf" | "cnpj" | null;
  valid: boolean;
};

function cpfValid(d: string): boolean {
  if (/^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

function cnpjValid(d: string): boolean {
  if (/^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const weights =
      len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * weights[i]!;
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

function check(d: string): DocumentResult {
  if (d.length === 11) return { digits: d, kind: "cpf", valid: cpfValid(d) };
  if (d.length === 14) return { digits: d, kind: "cnpj", valid: cnpjValid(d) };
  return { digits: d, kind: null, valid: false };
}

/** Só dígitos; 11 = CPF, 14 = CNPJ. Documento inválido não bloqueia: vira aviso na revisão. */
export function normalizeDocument(input: string | number | null | undefined): DocumentResult {
  const digits = String(input ?? "").replace(/\D/g, "");
  const direct = check(digits);
  if (direct.valid || digits.length === 0) return direct;
  // Planilhas costumam perder zeros à esquerda.
  for (const target of [11, 14]) {
    if (digits.length < target && digits.length >= target - 2) {
      const padded = check(digits.padStart(target, "0"));
      if (padded.valid) return padded;
    }
  }
  return direct;
}
