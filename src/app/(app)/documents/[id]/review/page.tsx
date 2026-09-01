import { notFound, redirect } from "next/navigation";
import { desc, eq, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { getProfileAccess } from "@/lib/profile-access";
import { ReviewPanel } from "./review-panel";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, id) });
  if (!doc) notFound();

  // Profile isolation: the document must belong to a profile this user can access.
  const access = await getProfileAccess(session.user.id, doc.profileId);
  if (!access) notFound();
  const { profile } = access;

  const job = await db.query.extractionJobs.findFirst({
    where: eq(schema.extractionJobs.documentId, doc.id),
    orderBy: [desc(schema.extractionJobs.createdAt)],
  });

  const items = job
    ? await db.query.extractedItems.findMany({
        where: eq(schema.extractedItems.extractionJobId, job.id),
        orderBy: [asc(schema.extractedItems.createdAt)],
      })
    : [];
  const images = job
    ? await db.query.clinicalImages.findMany({
        where: eq(schema.clinicalImages.extractionJobId, job.id),
        orderBy: [asc(schema.clinicalImages.sourcePage)],
      })
    : [];

  const observationTypes = await db.query.observationTypes.findMany({
    orderBy: [asc(schema.observationTypes.canonicalName)],
    columns: { id: true, canonicalName: true, aliases: true, category: true },
  });

  // A warning counts as resolved only because an observation answering it
  // exists — the resolution is the fix, not a flag someone set.
  const documentObservations = await db.query.observations.findMany({
    where: eq(schema.observations.documentId, doc.id),
    columns: { metadataJson: true },
  });
  const resolvedWarningKeys = documentObservations
    .map((row) => (row.metadataJson as { resolvesWarning?: string } | null)?.resolvesWarning)
    .filter((key): key is string => typeof key === "string" && key.length > 0);

  return (
    <ReviewPanel
      profileId={doc.profileId}
      resolvedWarningKeys={resolvedWarningKeys}
      document={{
        id: doc.id,
        filename: doc.originalFilename,
        mimeType: doc.mimeType,
        documentType: doc.documentType,
        documentDate: doc.documentDate,
        extractionStatus: doc.extractionStatus,
      }}
      profileName={profile.displayName}
      job={
        job
          ? {
              id: job.id,
              status: job.status,
              model: job.modelUsed,
              error: job.error,
              warnings: Array.isArray(job.warnings) ? (job.warnings as string[]) : [],
              uncertainItems: Array.isArray(job.uncertainItems)
                ? (job.uncertainItems as string[])
                : [],
              coverage:
                job.coverageJson && typeof job.coverageJson === "object"
                  ? (job.coverageJson as Record<string, unknown>)
                  : null,
            }
          : null
      }
      items={items.map((i) => ({
        id: i.id,
        itemType: i.itemType,
        status: i.status,
        rawJson: i.rawJson as Record<string, unknown>,
        confidence: i.confidence,
        userCorrected: i.userCorrected,
      }))}
      images={images.map((image) => ({
        id: image.id,
        status: image.status,
        assetKind: image.assetKind,
        studyName: image.studyName,
        pageLabel: image.pageLabel,
        sourcePage: image.sourcePage,
        width: image.width,
        height: image.height,
      }))}
      observationTypes={observationTypes}
    />
  );
}
