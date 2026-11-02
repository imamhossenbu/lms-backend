import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * Small crypto helpers for secrets at rest and one-time tokens.
 *  - encryptSecret / decryptSecret: AES-256-GCM. Key = DATA_ENCRYPTION_KEY (64 hex chars) if set,
 *    otherwise derived from SUPER_SECRET_KEY. Output format: "v1.<iv>.<tag>.<ciphertext>" (base64url).
 *  - randomToken / sha256: opaque tokens (e.g. invitation links) are stored only as their hash.
 */

function key(): Buffer {
  const hex = process.env.DATA_ENCRYPTION_KEY;
  if (hex && /^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, "hex");
  const base = process.env.SUPER_SECRET_KEY;
  if (!base) throw new Error("DATA_ENCRYPTION_KEY or SUPER_SECRET_KEY must be set to encrypt secrets");
  return createHash("sha256").update(`data-encryption:${base}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(payload: string): string {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unsupported secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** URL-safe random token (default 32 bytes ≈ 43 chars). */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
