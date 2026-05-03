import fs from "fs";
import path from "path";
import os from "os";
import { describe, it, expect, afterEach } from "vitest";
import { loadScrapedEvents, saveScrapedEvents } from "./write-db.js";

// ── loadScrapedEvents ─────────────────────────────────────────────────────────

describe("loadScrapedEvents", () => {
  let tmpFile: string | null = null;

  afterEach(() => {
    if (tmpFile && fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    tmpFile = null;
  });

  it("returns {} when file does not exist", () => {
    const nonExistent = path.join(os.tmpdir(), `granfondo-test-missing-${Date.now()}.json`);
    expect(loadScrapedEvents(nonExistent)).toEqual({});
  });

  it("parses a JSON file correctly", () => {
    tmpFile = path.join(os.tmpdir(), `granfondo-test-${Date.now()}.json`);
    const data = { "123": "2025-01-01T00:00:00.000Z", "456": "2025-06-15T12:00:00.000Z" };
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), "utf-8");
    expect(loadScrapedEvents(tmpFile)).toEqual(data);
  });
});

// ── saveScrapedEvents ─────────────────────────────────────────────────────────

describe("saveScrapedEvents", () => {
  let tmpFile: string | null = null;

  afterEach(() => {
    if (tmpFile && fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    tmpFile = null;
  });

  it("writes valid JSON that can be read back", () => {
    tmpFile = path.join(os.tmpdir(), `granfondo-test-write-${Date.now()}.json`);
    const data = { "789": "2025-08-20T08:30:00.000Z" };
    saveScrapedEvents(data, tmpFile);
    const raw = fs.readFileSync(tmpFile, "utf-8");
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(JSON.parse(raw)).toEqual(data);
  });
});

// ── round-trip ────────────────────────────────────────────────────────────────

describe("saveScrapedEvents / loadScrapedEvents round-trip", () => {
  let tmpFile: string | null = null;

  afterEach(() => {
    if (tmpFile && fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    tmpFile = null;
  });

  it("save then load returns the same object", () => {
    tmpFile = path.join(os.tmpdir(), `granfondo-test-roundtrip-${Date.now()}.json`);
    const original: Record<string, string> = {
      "1001": "2025-03-15T09:00:00.000Z",
      "1002": "2025-05-20T07:45:00.000Z",
      "90001": "2025-02-15T10:00:00.000Z",
    };
    saveScrapedEvents(original, tmpFile);
    const loaded = loadScrapedEvents(tmpFile);
    expect(loaded).toEqual(original);
  });
});
