/** Limite simples em memória: no máximo `max` tentativas por `windowMs` por chave. */
export function createRateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return {
    /** Retorna true se a tentativa é permitida (e a registra). */
    allow(key: string, now: number = Date.now()): boolean {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
  };
}

export const loginLimiter = createRateLimiter(5, 60_000);
