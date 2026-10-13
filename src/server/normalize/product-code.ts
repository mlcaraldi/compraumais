export type ProductCode = {
  /** só dígitos, 4 a 7 caracteres; null se não reconhecido */
  code: string | null;
  /** true quando o texto tinha ponto e a parte após o último ponto tem menos de 3 dígitos */
  ambiguous: boolean;
};

/** "Cód. 134911", "CÓDIGO 134.352" -> 134911, 134352. "168.90" e "94.2" são ambíguos e nunca casam sozinhos. */
export function parseProductCode(input: string | number | null | undefined): ProductCode {
  if (input === null || input === undefined) return { code: null, ambiguous: false };
  const original = String(input)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\b(CODIGO|COD)\b\.?:?/g, "")
    .replace(/\s+/g, "");

  let ambiguous = false;
  if (original.includes(".")) {
    const after = original.slice(original.lastIndexOf(".") + 1);
    if (/^\d+$/.test(after) && after.length < 3) ambiguous = true;
  }
  const cleaned = original.replace(/\./g, "");
  const ok = /^\d{4,7}$/.test(cleaned);
  return { code: ok ? cleaned : null, ambiguous };
}
