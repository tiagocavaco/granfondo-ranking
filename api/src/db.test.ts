import { describe, it, expect, beforeEach } from "vitest";
import { setGetDb, getDb } from "./db.js";
import type { DrizzleDb } from "@granfondo/database/db-client";

beforeEach(() => {
  // Reset the module-level state by re-injecting a fresh function each test.
  // setGetDb has no "clear" — but injecting null indirectly via reset is what
  // production code expects callers to do at startup. Tests just re-set.
  setGetDb(() => Promise.resolve({} as DrizzleDb));
});

describe("getDb / setGetDb", () => {
  it("returns the DB provided by setGetDb", async () => {
    const fake = { fake: true } as unknown as DrizzleDb;
    setGetDb(() => Promise.resolve(fake));
    await expect(getDb()).resolves.toBe(fake);
  });

  it("calls the injected function on every getDb invocation", async () => {
    // Allows callers to swap implementations (e.g. tests resetting DB
    // between cases) without the api caching a stale instance.
    let counter = 0;
    setGetDb(() => Promise.resolve({ n: ++counter } as unknown as DrizzleDb));
    const a = (await getDb()) as unknown as { n: number };
    const b = (await getDb()) as unknown as { n: number };
    expect(a.n).toBe(1);
    expect(b.n).toBe(2);
  });

  it("propagates injected errors as rejected promises", async () => {
    // The injection seam is the only way callers can fail; verify the error
    // surfaces correctly so downstream Promise.catch chains receive it.
    setGetDb(() =>
      Promise.reject(
        new Error("@granfondo/api: call setGetDb() before using the API"),
      ),
    );
    await expect(getDb()).rejects.toThrow(/call setGetDb/);
  });
});
