import { normalizeText } from "./text";

/** "Peito de perú (2 Farias)" -> "Peito de peru": sem parênteses de porcionamento, com a grafia corrigida. */
export function ingredientDisplayName(raw: string): string {
  return raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/(?<![\p{L}])perú(?![\p{L}])/giu, (m) => (m[0] === "P" ? "Peru" : "peru"))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Chave de identidade do ingrediente: sem acento, sem parênteses, "&" vira "E" e palavras em
 * ordem alfabética ("Chef & Co Chantilly" == "Chantilly Chef e Co").
 */
export function ingredientKey(raw: string): string {
  return normalizeText(ingredientDisplayName(raw).replace(/&/g, " E "))
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}
