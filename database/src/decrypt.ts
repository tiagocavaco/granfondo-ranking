/**
 * AES-256-GCM decryption for the SQLite database blob fetched from data.db.enc.
 * Binary layout (matches scraper's encryptBuffer): [iv:12][tag:16][ciphertext:N]
 *
 * WebCrypto asymmetry: Node.js crypto keeps ciphertext and auth tag separate,
 * but WebCrypto's subtle.decrypt expects them concatenated as ciphertext||tag.
 */

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let idx = 0; idx < hex.length; idx += 2) {
    bytes[idx / 2] = parseInt(hex.slice(idx, idx + 2), 16);
  }

  return bytes;
}

export async function decryptDatabase(
  enc: ArrayBuffer,
  keyHex: string,
): Promise<ArrayBuffer> {
  const iv = enc.slice(0, 12);
  const tag = enc.slice(12, 28);
  const ct = enc.slice(28);

  // WebCrypto AES-GCM decrypt expects ciphertext||authTag as a single buffer
  const ctWithTag = new Uint8Array(ct.byteLength + 16);
  ctWithTag.set(new Uint8Array(ct), 0);
  ctWithTag.set(new Uint8Array(tag), ct.byteLength);

  const key = await crypto.subtle.importKey(
    "raw",
    hexToBytes(keyHex).buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    ctWithTag,
  );
}
