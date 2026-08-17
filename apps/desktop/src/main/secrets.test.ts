import { describe, expect, it } from "vitest";
import {
  createSecrets,
  type SafeStorageLike,
  type SecretsDeps,
} from "./secrets";

/** In-memory fake for the injectable `fs` seam, backed by a `Map<string, Buffer>`. */
function makeFakeFs(): {
  fs: NonNullable<SecretsDeps["fs"]>;
  store: Map<string, Buffer>;
} {
  const store = new Map<string, Buffer>();
  const fs: NonNullable<SecretsDeps["fs"]> = {
    existsSync: (p) => store.has(p),
    readFileSync: (p) => {
      const data = store.get(p);
      if (!data) throw new Error(`ENOENT: no such file, open '${p}'`);
      return data;
    },
    writeFileSync: (p, data) => {
      store.set(p, data);
    },
    rmSync: (p) => {
      store.delete(p);
    },
    mkdirSync: () => {
      // no-op: the fake fs has no real directories to create
    },
  };
  return { fs, store };
}

/** A reversible fake `safeStorage`: prefixes bytes on encrypt, strips them on decrypt. */
function makeFakeSafeStorage(): SafeStorageLike & {
  setAvailable(v: boolean): void;
} {
  let available = true;
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain) => Buffer.from(`ENC:${plain}`),
    decryptString: (encrypted) =>
      encrypted.toString("utf8").replace(/^ENC:/, ""),
    setAvailable(v: boolean) {
      available = v;
    },
  };
}

describe("createSecrets", () => {
  it("hasKey() is false before any key is stored", () => {
    const { fs } = makeFakeFs();
    const safeStorage = makeFakeSafeStorage();
    const secrets = createSecrets({
      safeStorage,
      filePath: "/fake/secrets/anthropic.key",
      fs,
    });

    expect(secrets.hasKey()).toBe(false);
  });

  it("setKey() then getKey() round-trips through encrypt -> disk -> decrypt", () => {
    const { fs } = makeFakeFs();
    const safeStorage = makeFakeSafeStorage();
    const secrets = createSecrets({
      safeStorage,
      filePath: "/fake/secrets/anthropic.key",
      fs,
    });

    secrets.setKey("sk-ant-abc");

    expect(secrets.hasKey()).toBe(true);
    expect(secrets.getKey()).toBe("sk-ant-abc");
  });

  it("clearKey() removes the stored key", () => {
    const { fs } = makeFakeFs();
    const safeStorage = makeFakeSafeStorage();
    const secrets = createSecrets({
      safeStorage,
      filePath: "/fake/secrets/anthropic.key",
      fs,
    });

    secrets.setKey("sk-ant-abc");
    secrets.clearKey();

    expect(secrets.hasKey()).toBe(false);
    expect(secrets.getKey()).toBe(null);
  });

  it("getKey() returns null (does not throw) when the stored blob can't be decrypted", () => {
    const { fs, store } = makeFakeFs();
    const safeStorage = makeFakeSafeStorage();
    // A corrupt / cross-machine ciphertext: decryptString throws instead of returning a string.
    safeStorage.decryptString = () => {
      throw new Error("decrypt failed");
    };
    // Seed a blob directly so hasKey()/existsSync see a stored key.
    store.set("/fake/secrets/anthropic.key", Buffer.from("corrupt-blob"));
    const secrets = createSecrets({
      safeStorage,
      filePath: "/fake/secrets/anthropic.key",
      fs,
    });

    expect(secrets.hasKey()).toBe(true);
    expect(() => secrets.getKey()).not.toThrow();
    expect(secrets.getKey()).toBe(null);
  });

  it("setKey() throws and writes nothing when encryption is unavailable", () => {
    const { fs, store } = makeFakeFs();
    const safeStorage = makeFakeSafeStorage();
    safeStorage.setAvailable(false);
    const secrets = createSecrets({
      safeStorage,
      filePath: "/fake/secrets/anthropic.key",
      fs,
    });

    expect(() => secrets.setKey("sk-ant-abc")).toThrow();
    expect(store.size).toBe(0);
    expect(secrets.hasKey()).toBe(false);
  });
});
