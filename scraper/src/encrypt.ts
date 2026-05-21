/**
 * encrypt.ts
 *
 * AES-256-GCM encrypt/decrypt for the SQLite database buffer.
 * Binary layout: [iv:12][tag:16][ciphertext:N]
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALG = "aes-256-gcm";

export function encryptBuffer(plaintext: Buffer, keyHex: string): Buffer {
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

export function decryptBuffer(encrypted: Buffer, keyHex: string): Buffer {
  const key = Buffer.from(keyHex, "hex");
  const iv = encrypted.subarray(0, 12);
  const tag = encrypted.subarray(12, 28);
  const ct = encrypted.subarray(28);
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}
