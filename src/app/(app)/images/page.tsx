import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { Images } from "lucide-react";
import { auth } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { db, schema } from "@/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/mascot";

export default async function ClinicalImagesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { profile } = await getActiveProfile(session.user.id);
  if (!profile) redirect("/profiles");

  const assets = await db.query.clinicalImages.findMany({
    where: and(
      eq(schema.clinicalImages.profileId, profile.id),
      eq(schema.clinicalImages.status, "accepted")
    ),
    orderBy: [asc(schema.clinicalImages.reportDate), asc(schema.clinicalImages.sourcePage)],
  });
  const groups = new Map<string, typeof assets>();
  for (const asset of assets) {
    const rows = groups.get(asset.comparisonKey) ?? [];
    rows.push(asset);
    groups.set(asset.comparisonKey, rows);
  }

  return (
    <div className="grid gap-6">
      <div>
        <Badge className="mb-2 bg-accent text-accent-foreground" variant="secondary">
          Longitudinal images
        </Badge>
        <h1 className="text-3xl font-semibold">Scans & report images</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Encrypted source-page images grouped by study, body region, and laterality. Compare
          them side by side while retaining labels, scale, and acquisition context.
        </p>
      </div>

      {assets.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              mood="calm"
              title="No confirmed scan images yet"
              description="Reprocess an imaging report, review its extracted data, and confirm it to add its protected images here."
            />
          </CardContent>
        </Card>
      ) : (
        [...groups.entries()].map(([key, rows]) => (
          <Card key={key}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <Images className="size-4 text-primary" />
                {rows[0].studyName ?? rows[0].assetKind}
                <Badge variant="outline">{rows[0].assetKind}</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {rows[0].bodyPart ?? "Body region not printed"}
                {rows[0].laterality ? ` · ${rows[0].laterality}` : ""} · {rows.length} image
                {rows.length === 1 ? "" : "s"}
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid snap-x grid-flow-col auto-cols-[min(84vw,28rem)] gap-4 overflow-x-auto pb-2 sm:auto-cols-[min(58vw,30rem)] lg:auto-cols-[min(42vw,32rem)]">
                {rows.map((asset) => (
                  <figure key={asset.id} className="snap-start overflow-hidden rounded-xl border bg-muted/20">
                    <Link href={`/api/clinical-images/${asset.id}/file`} target="_blank">
                      <Image
                        unoptimized
                        src={`/api/clinical-images/${asset.id}/file`}
                        alt={asset.pageLabel ?? "Clinical report image"}
                        width={asset.width ?? 1278}
                        height={asset.height ?? 1808}
                        className="h-auto max-h-[70svh] w-full bg-white object-contain"
                      />
                    </Link>
                    <figcaption className="border-t p-3 text-xs">
                      <p className="font-medium">{asset.reportDate ?? "Date not printed"}</p>
                      <p className="mt-0.5 text-muted-foreground">
                        {asset.pageLabel ?? `Source page ${asset.sourcePage ?? "—"}`}
                      </p>
                    </figcaption>
                  </figure>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Visual comparison only. Different equipment, positioning, scale, and report layout can
                make images look different; clinical interpretation should use the measurements and a clinician.
              </p>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
