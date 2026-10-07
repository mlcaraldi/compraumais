import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../db/client";
import { getUserById } from "../repos/users";
import { SESSION_COOKIE, verifySessionToken } from "./session";

export async function getCurrentUser() {
  const store = await cookies();
  const session = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  return getUserById(getDb(), session.tid, session.uid);
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
