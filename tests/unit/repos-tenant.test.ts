import { describe, expect, it } from "vitest";
import * as repos from "@/server/repos";
import type { Db } from "@/server/db/client";

type RepoFn = (db: Db, tenantId: string, ...rest: never[]) => unknown;

describe("camada repos exige tenantId", () => {
  it("tipo: chamar sem tenantId não compila", () => {
    const fake = {} as Db;
    // @ts-expect-error tenantId é obrigatório
    void (() => repos.usersRepo.listUsers(fake));
    // @ts-expect-error tenantId é obrigatório
    void (() => repos.settingsRepo.getEngineSettings(fake));
    expect(true).toBe(true);
  });

  it("execução: toda função exportada rejeita tenantId vazio", async () => {
    const fns = Object.values(repos).flatMap((ns) => Object.values(ns)) as RepoFn[];
    expect(fns.length).toBeGreaterThan(0);
    for (const fn of fns) {
      expect(fn.length).toBeGreaterThanOrEqual(2);
      await expect(Promise.resolve().then(() => fn({} as Db, "" as never))).rejects.toThrow(
        /tenantId/,
      );
    }
  });
});
