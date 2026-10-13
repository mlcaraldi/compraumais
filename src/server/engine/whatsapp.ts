/** Link do WhatsApp com o texto preenchido; null quando o telefone não serve para WhatsApp. */
export function whatsappLink(e164: string | null, phoneKind: string, text: string): string | null {
  if (!e164 || phoneKind === "landline" || phoneKind === "invalid") return null;
  return `https://wa.me/${e164.replace(/^\+/, "")}?text=${encodeURIComponent(text)}`;
}
