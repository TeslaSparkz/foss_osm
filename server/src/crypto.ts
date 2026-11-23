import crypto from "node:crypto";

// TOKEN_ENC_KEY: 32 random bytes, base64 (generate with: openssl rand -base64 32)
const key = process.env.TOKEN_ENC_KEY ? Buffer.from(process.env.TOKEN_ENC_KEY, "base64") : null;
if (key && key.length !== 32) throw new Error("TOKEN_ENC_KEY must decode to exactly 32 bytes");
export const hasEncryptionKey = key !== null;

export function encrypt(plain: string): string {
  if (!key) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return "enc:" + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function decrypt(stored: string): string {
  if (!stored.startsWith("enc:")) return stored;
  if (!key) throw new Error("Stored token is encrypted but TOKEN_ENC_KEY is not set");
  const buf = Buffer.from(stored.slice(4), "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}
