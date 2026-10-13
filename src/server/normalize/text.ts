/** Maiúsculas, sem acento, espaços colapsados. Usado em chaves de busca, nunca para exibir. */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return "";
  return input.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

const SMALL_WORDS = new Set([
  "e",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "com",
  "para",
  "pra",
  "a",
  "o",
  "em",
]);

/** "RESTAURANTE E CAFE CULTURA" -> "Restaurante e Cafe Cultura". Usado para exibir. */
export function titleCase(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
