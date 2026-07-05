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

const TYPE_LABELS: Record<string, string> = {
  lab_report: "Lab report",
  prescription: "Prescription",
  imaging: "Imaging",
  specialist_report: "Specialist report",
  discharge_summary: "Discharge summary",
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Documents</h1>
          <p className="text-sm text-muted-foreground">
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
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <FileText className="size-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">No documents yet.</p>
            <Button asChild variant="outline">
              <Link href="/upload">Upload the first report</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {docs.map((d) => (
            <Link key={d.id} href={`/documents/${d.id}/review`}>
              <Card className="py-3 transition-colors hover:bg-accent/50">
                <CardContent className="flex items-center gap-4 px-4">
                  <FileText className="size-5 shrink-0 text-muted-foreground" />
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
