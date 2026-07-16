import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  Cache,
  NoopCache,
  InMemoryCache,
  RedisCache,
  type RedisClient,
} from "../src/cache/index.js";

describe("Cache — abstraction", () => {
  it("Cache is abstract and cannot be instantiated directly", () => {
    expect(() => new (Cache as any)()).toThrow();
  });

  it("a custom cache must implement all methods and expose a name", async () => {
    class StubCache extends Cache {
      readonly name = "stub";
      async get<T>(): Promise<T | undefined> { return undefined; }
      async set(): Promise<void> {}
      async has(): Promise<boolean> { return false; }
      async delete(): Promise<boolean> { return true; }
      async clear(): Promise<void> {}
    }
    const c = new StubCache();
    expect(c.name).toBe("stub");
    expect(await c.get("x")).toBeUndefined();
    expect(await c.has("x")).toBe(false);
    expect(await c.delete("x")).toBe(true);
  });
});

describe("NoopCache", () => {
  const cache = new NoopCache();

  it("never returns a stored value", async () => {
    await cache.set("key", "value");
    expect(await cache.get("key")).toBeUndefined();
  });

  it("always reports has() as false", async () => {
    expect(await cache.has("any")).toBe(false);
  });

  it("delete always returns true", async () => {
    expect(await cache.delete("whatever")).toBe(true);
  });

  it("clear does not throw", async () => {
    await expect(cache.clear()).resolves.toBeUndefined();
  });

  it("name is 'noop'", () => {
    expect(cache.name).toBe("noop");
  });
});

describe("InMemoryCache", () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = new InMemoryCache();
  });

  it("stores and retrieves a value", async () => {
    await cache.set("name", "Alice");
    expect(await cache.get("name")).toBe("Alice");
  });

  it("stores complex objects", async () => {
    const obj = { user: { id: 1, tags: ["a", "b"] } };
    await cache.set("obj", obj);
    expect(await cache.get("obj")).toEqual(obj);
  });

  it("has() returns true for existing keys", async () => {
    await cache.set("k", 42);
    expect(await cache.has("k")).toBe(true);
  });

  it("has() returns false for missing keys", async () => {
    expect(await cache.has("nope")).toBe(false);
  });

  it("delete() removes a key", async () => {
    await cache.set("k", 1);
    expect(await cache.delete("k")).toBe(true);
    expect(await cache.get("k")).toBeUndefined();
  });

  it("delete() returns false for missing keys", async () => {
    expect(await cache.delete("missing")).toBe(false);
  });

  it("clear() removes all keys", async () => {
    await cache.set("a", 1);
    await cache.set("b", 2);
    await cache.clear();
    expect(await cache.get("a")).toBeUndefined();
    expect(await cache.get("b")).toBeUndefined();
  });

  it("respects custom ttl", async () => {
    await cache.set("ephemeral", "gone", 10); // 10ms
    expect(await cache.get("ephemeral")).toBe("gone");
    await new Promise((r) => setTimeout(r, 20));
    expect(await cache.get("ephemeral")).toBeUndefined();
  });

  it("default ttl is 1 hour", async () => {
    await cache.set("persist", "here");
    // Should still be present within the default window
    expect(await cache.get("persist")).toBe("here");
  });

  it("exposes size of the store", async () => {
    expect(cache.size).toBe(0);
    await cache.set("a", 1);
    expect(cache.size).toBe(1);
  });

  it("handles falsey values (0, empty string, null)", async () => {
    await cache.set("zero", 0);
    await cache.set("empty", "");
    await cache.set("null", null);
    expect(await cache.get("zero")).toBe(0);
    expect(await cache.get("empty")).toBe("");
    expect(await cache.get("null")).toBeNull();
  });

  it("name is 'in-memory'", () => {
    expect(cache.name).toBe("in-memory");
  });
});

describe("RedisCache", () => {
  let store: Map<string, string>;
  let client: RedisClient;
  let cache: RedisCache;

  beforeEach(() => {
    store = new Map();
    client = {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: string, ...args: string[]) => {
        // "PX" <ms> — parse TTL and store with expiry marker
        const pxIdx = args.indexOf("PX");
        if (pxIdx !== -1) {
          const ttl = parseInt(args[pxIdx + 1], 10);
          store.set(key, value);
          // Simulate expiry by scheduling deletion
          setTimeout(() => store.delete(key), ttl);
        } else {
          store.set(key, value);
        }
      }),
      del: vi.fn(async (...keys: string[]) => {
        let count = 0;
        for (const k of keys) {
          if (store.delete(k)) count++;
        }
        return count;
      }),
    };
    cache = new RedisCache(client);
  });

  it("stores and retrieves a value", async () => {
    await cache.set("name", "Bob");
    expect(await cache.get("name")).toBe("Bob");
  });

  it("stores complex objects via JSON", async () => {
    const obj = { list: [1, 2, 3] };
    await cache.set("obj", obj);
    expect(await cache.get("obj")).toEqual(obj);
  });

  it("has() returns true for existing keys", async () => {
    await cache.set("k", "v");
    expect(await cache.has("k")).toBe(true);
  });

  it("has() returns false for missing keys", async () => {
    expect(await cache.has("missing")).toBe(false);
  });

  it("delete() removes a key", async () => {
    await cache.set("k", "v");
    expect(await cache.delete("k")).toBe(true);
    expect(await cache.get("k")).toBeUndefined();
  });

  it("delete() returns false for missing keys", async () => {
    expect(await cache.delete("nope")).toBe(false);
  });

  it("clear() is a no-op (does not throw)", async () => {
    await cache.set("a", "1");
    await cache.clear();
    // clear is intentionally a no-op per the RedisCache contract
    expect(await cache.get("a")).toBe("1");
  });

  it("respects custom ttl via PX", async () => {
    await cache.set("ttl", "val", 50);
    expect(await cache.get("ttl")).toBe("val");
    await new Promise((r) => setTimeout(r, 60));
    expect(await cache.get("ttl")).toBeUndefined();
  });

  it("uses default ttl when none provided", async () => {
    await cache.set("def", "ault");
    expect(client.set).toHaveBeenCalledWith(
      "def",
      expect.any(String),
      "PX",
      "3600000",
    );
  });

  it("delegates to the injected Redis client", async () => {
    await cache.set("a", 1);
    await cache.get("a");
    await cache.has("a");
    await cache.delete("a");
    expect(client.set).toHaveBeenCalledOnce();
    expect(client.get).toHaveBeenCalledTimes(2); // get + has
    expect(client.del).toHaveBeenCalledOnce();
  });

  it("name is 'redis'", () => {
    expect(cache.name).toBe("redis");
  });
});
