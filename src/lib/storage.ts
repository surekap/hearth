import { mkdir, readFile, writeFile, unlink } from "fs/promises";
import path from "path";

/**
 * Object storage abstraction. Uses Vercel Blob when BLOB_READ_WRITE_TOKEN is
 * set; otherwise falls back to local disk under ./storage (dev only).
 * All stored payloads are already AES-256-GCM encrypted by the caller —
 * the storage backend never sees plaintext documents.
 *
 * putObject returns the canonical storage key to persist: the blob URL for
 * Vercel Blob, or the relative key for local disk.
 */

const LOCAL_DIR = path.join(process.cwd(), "storage");

function useBlob() {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export async function putObject(key: string, data: Buffer): Promise<string> {
  if (useBlob()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(key, data, {
      // Payload is encrypted and the URL is unguessable; access still goes
      // through the authenticated /api/documents/:id/file endpoint.
      access: "public",
      contentType: "application/octet-stream",
      addRandomSuffix: true,
    });
    return blob.url;
  }
  const filePath = path.join(LOCAL_DIR, key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, data);
  return key;
}

export async function getObject(storedKey: string): Promise<Buffer> {
  if (storedKey.startsWith("http")) {
    const res = await fetch(storedKey);
    if (!res.ok) throw new Error(`Blob fetch failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return readFile(path.join(LOCAL_DIR, storedKey));
}

export async function deleteObject(storedKey: string): Promise<void> {
  if (storedKey.startsWith("http")) {
    const { del } = await import("@vercel/blob");
    await del(storedKey);
    return;
  }
  await unlink(path.join(LOCAL_DIR, storedKey)).catch(() => {});
}
