import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";

/**
 * Encrypted document storage backed by the host filesystem. In production,
 * Docker mounts durable storage at DOCUMENT_STORAGE_DIR. All payloads are
 * AES-256-GCM encrypted by the caller, so this layer never sees plaintext.
 */

function storageRoot() {
  const defaultRoot = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "storage"
  );
  return path.resolve(
    process.env.DOCUMENT_STORAGE_DIR ?? defaultRoot
  );
}

function localObjectPath(key: string) {
  if (/^https?:\/\//i.test(key)) {
    throw new Error("Remote object storage keys are not supported");
  }

  const root = storageRoot();
  const filePath = path.resolve(/* turbopackIgnore: true */ root, key);
  if (filePath !== root && filePath.startsWith(`${root}${path.sep}`)) return filePath;
  throw new Error("Invalid storage key");
}

export async function putObject(key: string, data: Buffer): Promise<string> {
  const filePath = localObjectPath(key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, data);
  return key;
}

export async function getObject(storedKey: string): Promise<Buffer> {
  return readFile(localObjectPath(storedKey));
}

export async function deleteObject(storedKey: string): Promise<void> {
  await unlink(localObjectPath(storedKey)).catch(() => {});
}
