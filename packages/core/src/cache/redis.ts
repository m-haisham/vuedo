import { Cache, DEFAULT_TTL_MS } from "./types.js";

export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: string[]): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
}

export class RedisCache extends Cache {
  readonly name = "redis";
  private readonly client: RedisClient;

  constructor(client: RedisClient) {
    super();
    this.client = client;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.client.get(key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): Promise<void> {
    const serialized = JSON.stringify(value);
    await this.client.set(key, serialized, "PX", String(ttlMs));
  }

  async has(key: string): Promise<boolean> {
    const raw = await this.client.get(key);
    return raw !== null;
  }

  async delete(key: string): Promise<boolean> {
    const count = await this.client.del(key);
    return count > 0;
  }

  async clear(): Promise<void> {
    // no generic flush — RedisCache operates on a shared namespace
    // and should not blindly FLUSHDB. Callers who need a full flush
    // should issue it against their own Redis client directly.
  }
}
