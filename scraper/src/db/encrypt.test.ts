import { describe, it, expect } from "vitest";
import { encryptBuffer, decryptBuffer } from "./encrypt.js";

const KEY = "a".repeat(64); // 32 bytes as hex

// ── encryptBuffer / decryptBuffer ─────────────────────────────────────────────

describe("encryptBuffer / decryptBuffer", () => {
  it("round-trips arbitrary plaintext", () => {
    const plain = Buffer.from("Hello, world!");
    const enc = encryptBuffer(plain, KEY);
    expect(decryptBuffer(enc, KEY)).toEqual(plain);
  });

  it("round-trips empty buffer", () => {
    const plain = Buffer.alloc(0);
    const enc = encryptBuffer(plain, KEY);
    expect(decryptBuffer(enc, KEY)).toEqual(plain);
  });

  it("round-trips binary data", () => {
    const plain = Buffer.from([0x00, 0xff, 0x42, 0x00, 0x01]);
    const enc = encryptBuffer(plain, KEY);
    expect(decryptBuffer(enc, KEY)).toEqual(plain);
  });

  it("produces output larger than plaintext (iv + tag overhead)", () => {
    const plain = Buffer.from("test");
    const enc = encryptBuffer(plain, KEY);
    expect(enc.length).toBe(plain.length + 12 + 16); // iv:12 + tag:16
  });

  it("uses a random IV — two encryptions of the same data differ", () => {
    const plain = Buffer.from("same input");
    const enc1 = encryptBuffer(plain, KEY);
    const enc2 = encryptBuffer(plain, KEY);
    expect(enc1.equals(enc2)).toBe(false);
  });

  it("each encryption decrypts to the same plaintext", () => {
    const plain = Buffer.from("same input");
    const enc1 = encryptBuffer(plain, KEY);
    const enc2 = encryptBuffer(plain, KEY);
    expect(decryptBuffer(enc1, KEY)).toEqual(plain);
    expect(decryptBuffer(enc2, KEY)).toEqual(plain);
  });

  it("throws on wrong key (auth tag mismatch)", () => {
    const plain = Buffer.from("secret");
    const enc = encryptBuffer(plain, KEY);
    const wrongKey = "b".repeat(64);
    expect(() => decryptBuffer(enc, wrongKey)).toThrow();
  });

  it("throws when ciphertext is tampered", () => {
    const plain = Buffer.from("important data");
    const enc = encryptBuffer(plain, KEY);
    const tampered = Buffer.from(enc);
    tampered[28] ^= 0xff; // flip a byte in the ciphertext
    expect(() => decryptBuffer(tampered, KEY)).toThrow();
  });

  it("throws when auth tag is tampered", () => {
    const plain = Buffer.from("important data");
    const enc = encryptBuffer(plain, KEY);
    const tampered = Buffer.from(enc);
    tampered[12] ^= 0x01; // flip a byte in the tag
    expect(() => decryptBuffer(tampered, KEY)).toThrow();
  });

  it("round-trips a large buffer (64 KB)", () => {
    const plain = Buffer.alloc(65536, 0xab);
    const enc = encryptBuffer(plain, KEY);
    expect(decryptBuffer(enc, KEY)).toEqual(plain);
  });
});
