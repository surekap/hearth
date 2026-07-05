import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser, requireProfile, handleApiError, ApiError, logAudit } from "@/lib/api";
import { encryptBuffer, sha256Hex } from "@/lib/crypto";
import { putObject } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024; // 20MB

const ALLOWED_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const metaSchema = z.object({
  profileId: z.string().uuid(),
  documentType: z
    .enum([
      "lab_report",
      "prescription",
      "imaging",
      "specialist_report",
      "discharge_summary",
      "invoice",
      "other",
    ])
    .default("other"),
  source: z
    .enum(["apollo", "whatsapp", "camera", "files", "manual", "unknown"])
    .default("unknown"),
  documentDate: z.string().date().nullish(),
});

/** Basic magic-byte sniffing so a renamed .exe can't masquerade as a PDF. */
function sniffMime(buf: Buffer): string | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "image/png";
  if (
    buf.subarray(0, 4).toString("latin1") === "RIFF" &&
    buf.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return "image/webp";
  return null;
}

/**
 * Session auth for the PWA, or bearer-token auth for the iOS Shortcut flow
 * (Phase 1.5): Authorization: Bearer <users.api_token>.
 */
async function requireUploader(req: NextRequest) {
  try {
    return await requireUser();
  } catch {
    const header = req.headers.get("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new ApiError(401, "Not authenticated");
    const user = await db.query.users.findFirst({
      where: eq(schema.users.apiToken, token),
    });
    if (!user) throw new ApiError(401, "Invalid token");
    return { userId: user.id, email: user.email };
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireUploader(req);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Missing file");
    if (file.size === 0) throw new ApiError(400, "Empty file");
    if (file.size > MAX_BYTES) throw new ApiError(413, "File too large (max 20MB)");

    const meta = metaSchema.parse({
      profileId: form.get("profileId"),
      documentType: form.get("documentType") ?? undefined,
      source: form.get("source") ?? undefined,
      documentDate: (form.get("documentDate") as string) || undefined,
    });

    await requireProfile(userId, meta.profileId);

    const buffer = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffMime(buffer);
    if (!sniffed || !ALLOWED_MIME[sniffed]) {
      throw new ApiError(415, "Only PDF, JPEG, PNG and WebP files are supported");
    }

    const hash = sha256Hex(buffer);
    const duplicate = await db.query.documents.findFirst({
      where: and(
        eq(schema.documents.profileId, meta.profileId),
        eq(schema.documents.sha256Hash, hash)
      ),
    });
    if (duplicate) {
      return NextResponse.json(
        { error: "This file was already uploaded for this profile", documentId: duplicate.id },
        { status: 409 }
      );
    }

    const encrypted = encryptBuffer(buffer);
    const key = `documents/${meta.profileId}/${hash}.${ALLOWED_MIME[sniffed]}.enc`;
    const storedKey = await putObject(key, encrypted);

    const [doc] = await db
      .insert(schema.documents)
      .values({
        profileId: meta.profileId,
        uploadedByUserId: userId,
        documentType: meta.documentType,
        source: meta.source,
        originalFilename: file.name || `upload.${ALLOWED_MIME[sniffed]}`,
        mimeType: sniffed,
        storageKey: storedKey,
        sha256Hash: hash,
        documentDate: meta.documentDate ?? null,
        encrypted: true,
      })
      .returning();

    await logAudit({
      userId,
      profileId: meta.profileId,
      action: "upload",
      targetType: "document",
      targetId: doc.id,
      detail: { filename: doc.originalFilename, mime: sniffed, bytes: file.size },
    });

    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues }, { status: 400 });
    }
    return handleApiError(e);
  }
}
