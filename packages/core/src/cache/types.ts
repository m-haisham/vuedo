export const DEFAULT_TTL_MS = 3600000; // 1 hour

export abstract class Cache {
  constructor() {
    if (new.target === Cache) {
      throw new Error("Cache is abstract and cannot be instantiated directly");
    }
  }

  abstract readonly name: string;

  abstract get<T>(key: string): Promise<T | undefined>;

  abstract set<T>(key: string, value: T, ttlMs?: number): Promise<void>;

  abstract has(key: string): Promise<boolean>;

  abstract delete(key: string): Promise<boolean>;

  abstract clear(): Promise<void>;
}
