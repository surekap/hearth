import { notFound, redirect } from "next/navigation";
import { desc, eq, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
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

  // Profile isolation: the document must belong to one of this user's profiles.
  const profile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.id, doc.profileId),
  });
  if (!profile || profile.userId !== session.user.id) notFound();

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

  const observationTypes = await db.query.observationTypes.findMany({
    orderBy: [asc(schema.observationTypes.canonicalName)],
    columns: { id: true, canonicalName: true, category: true },
  });

  return (
    <ReviewPanel
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
      observationTypes={observationTypes}
    />
  );
}
