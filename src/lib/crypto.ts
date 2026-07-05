import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function masterKey(): Buffer {
  const hex = process.env.DOCUMENT_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "DOCUMENT_ENCRYPTION_KEY must be set to a 32-byte hex string (openssl rand -hex 32)"
    );
  }
  return Buffer.from(hex, "hex");
}

/** Encrypted layout: [12-byte IV][16-byte auth tag][ciphertext] */
export function encryptBuffer(plain: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, masterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

export function decryptBuffer(blob: Buffer): Buffer {
  const iv = blob.subarray(0, IV_LENGTH);
  const tag = blob.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const data = blob.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGO, masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
