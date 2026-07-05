import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { FileText, Upload } from "lucide-react";
import { auth } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { db, schema } from "@/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/mascot";

const TYPE_LABELS: Record<string, string> = {
  lab_report: "Lab report",
  prescription: "Prescription",
  imaging: "Imaging",
  specialist_report: "Specialist report",
  discharge_summary: "Discharge summary",
  genetic_report: "Genetic report",
  invoice: "Invoice",
  other: "Other",
};

function extractionBadge(status: string) {
  switch (status) {
    case "confirmed":
      return <Badge className="bg-emerald-600 text-white">confirmed</Badge>;
    case "draft":
      return <Badge className="bg-amber-500 text-white">needs review</Badge>;
    case "failed":
      return <Badge variant="destructive">failed</Badge>;
    case "rejected":
      return <Badge variant="outline">rejected</Badge>;
    default:
      return <Badge variant="secondary">pending</Badge>;
  }
}

export default async function DocumentsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { profile } = await getActiveProfile(session.user.id);
  if (!profile) redirect("/profiles");

  const docs = await db.query.documents.findMany({
    where: eq(schema.documents.profileId, profile.id),
    orderBy: [desc(schema.documents.uploadedAt)],
  });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge className="mb-2 bg-accent text-accent-foreground" variant="secondary">
            Library
          </Badge>
          <h1 className="text-3xl font-semibold">Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {profile.displayName}&apos;s medical documents
          </p>
        </div>
        <Button asChild>
          <Link href="/upload">
            <Upload className="size-4" />
            Upload
          </Link>
        </Button>
      </div>

      {docs.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              mood="calm"
              title="No documents yet"
              description="Upload a report, prescription, or image and Hearth will keep it attached to this profile."
            >
            <Button asChild>
              <Link href="/upload">Upload the first report</Link>
            </Button>
            </EmptyState>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {docs.map((d) => (
            <Link key={d.id} href={`/documents/${d.id}/review`}>
              <Card className="interactive-card py-3">
                <CardContent className="flex items-center gap-4 px-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                    <FileText className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{d.originalFilename}</p>
                    <p className="text-xs text-muted-foreground">
                      {TYPE_LABELS[d.documentType]} · {d.source} ·{" "}
                      {d.documentDate ?? d.uploadedAt.toISOString().slice(0, 10)}
                    </p>
                  </div>
                  {extractionBadge(d.extractionStatus)}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
