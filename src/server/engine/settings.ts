export type EngineSettings = {
  maxSuggestions: number;
  maxListB: number;
  coverageFactor: number;
  defaultCoverageDays: number;
  regularMinHits: number;
  regularWindowOrders: number;
  declineCooldownDays: number;
  promotionDefaultDays: number;
};

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  maxSuggestions: 3,
  maxListB: 2,
  coverageFactor: 0.8,
  defaultCoverageDays: 14,
  regularMinHits: 3,
  regularWindowOrders: 6,
  declineCooldownDays: 30,
  promotionDefaultDays: 7,
};
