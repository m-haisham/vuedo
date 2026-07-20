import { Cache } from "./types.js";

export class NoopCache extends Cache {
  readonly name = "noop";

  async get<T>(): Promise<T | undefined> {
    return undefined;
  }

  async set(): Promise<void> {}

  async has(): Promise<boolean> {
    return false;
  }

  async delete(): Promise<boolean> {
    return true;
  }

  async clear(): Promise<void> {}
}
