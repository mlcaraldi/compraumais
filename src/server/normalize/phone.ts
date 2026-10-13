export type PhoneKind = "mobile" | "landline" | "invalid";

export type PhoneResult = {
  e164: string | null;
  kind: PhoneKind;
  fixedNinthDigit: boolean;
};

const CARRIER_CODES = new Set(["12", "14", "15", "21", "25", "31", "41", "43", "49"]);

/** DDDs brasileiros em uso. */
const VALID_DDD = new Set(
  [
    ...[11, 12, 13, 14, 15, 16, 17, 18, 19],
    ...[21, 22, 24, 27, 28],
    ...[31, 32, 33, 34, 35, 37, 38],
    ...[41, 42, 43, 44, 45, 46, 47, 48, 49],
    ...[51, 53, 54, 55],
    ...[61, 62, 63, 64, 65, 66, 67, 68, 69],
    ...[71, 73, 74, 75, 77, 79],
    ...[81, 82, 83, 84, 85, 86, 87, 88, 89],
    ...[91, 92, 93, 94, 95, 96, 97, 98, 99],
  ].map(String),
);

const INVALID: PhoneResult = { e164: null, kind: "invalid", fixedNinthDigit: false };

export function normalizePhone(input: string | null | undefined): PhoneResult {
  let d = (input ?? "").replace(/\D/g, "");
  if (!d) return INVALID;

  if (d.startsWith("0")) {
    d = d.slice(1);
    if (CARRIER_CODES.has(d.slice(0, 2)) && d.length - 2 >= 10 && d.length - 2 <= 13) {
      d = d.slice(2);
    }
  }
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);

  if (d.length !== 10 && d.length !== 11) return INVALID;
  if (!VALID_DDD.has(d.slice(0, 2))) return INVALID;

  const third = d.charAt(2);
  if (d.length === 11) {
    return third === "9" ? { e164: `+55${d}`, kind: "mobile", fixedNinthDigit: false } : INVALID;
  }
  if (third >= "6" && third <= "9") {
    return { e164: `+55${d.slice(0, 2)}9${d.slice(2)}`, kind: "mobile", fixedNinthDigit: true };
  }
  if (third >= "2" && third <= "5") {
    return { e164: `+55${d}`, kind: "landline", fixedNinthDigit: false };
  }
  return INVALID;
}

/** Mascara para logs: +55549****1234 */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  if (e164.length < 9) return "****";
  return `${e164.slice(0, 6)}****${e164.slice(-4)}`;
}
