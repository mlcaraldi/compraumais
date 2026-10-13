import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "cm_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type SessionPayload = { uid: string; tid: string; exp: number };

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET deve ter pelo menos 32 caracteres");
  return s;
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function createSessionToken(
  uid: string,
  tid: string,
  now: Date = new Date(),
  maxAgeSeconds = SESSION_MAX_AGE_SECONDS,
): string {
  const payload: SessionPayload = {
    uid,
    tid,
    exp: Math.floor(now.getTime() / 1000) + maxAgeSeconds,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(
  token: string | undefined | null,
  now: Date = new Date(),
): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (typeof payload.uid !== "string" || typeof payload.tid !== "string") return null;
    if (payload.exp * 1000 <= now.getTime()) return null;
    return payload;
  } catch {
    return null;
  }
}
