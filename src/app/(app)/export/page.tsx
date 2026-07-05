import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Download, FileJson, FileText, Smartphone, RefreshCw } from "lucide-react";
import { auth } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { db, schema } from "@/db";
import { regenerateApiToken } from "@/app/actions/api-token";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function ExportPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { profile } = await getActiveProfile(session.user.id);
  if (!profile) redirect("/profiles");

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, session.user.id),
  });

  const formats = [
    {
      href: `/api/export/profile/${profile.id}/pdf`,
      icon: FileText,
      title: "Doctor-friendly PDF",
      description:
        "Cover summary, abnormal values, medications, lab history and document index — made to hand to a physician.",
      cta: "Download PDF",
      primary: true,
    },
    {
      href: `/api/export/profile/${profile.id}/json`,
      icon: FileJson,
      title: "Internal JSON",
      description:
        "Complete raw export of this profile's confirmed data — observations, reports, medications, document metadata.",
      cta: "Download JSON",
    },
    {
      href: `/api/export/profile/${profile.id}/fhir`,
      icon: FileJson,
      title: "FHIR bundle",
      description:
        "FHIR-inspired R4 Bundle (Patient, Observation, DiagnosticReport, DocumentReference, MedicationStatement) for interoperability.",
      cta: "Download FHIR",
    },
  ];

  return (
    <div className="grid gap-6">
      <div>
        <Badge className="mb-2 bg-accent text-accent-foreground" variant="secondary">
          Export
        </Badge>
        <h1 className="text-3xl font-semibold">Take your data with you</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything below exports {profile.displayName}&apos;s confirmed records only. Each
          export is audit-logged.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {formats.map((f) => (
          <Card key={f.href} className={f.primary ? "border-primary/40 shadow-md shadow-primary/10" : undefined}>
            <CardHeader>
              <f.icon className="mb-1 size-6 text-primary" />
              <CardTitle className="text-base">{f.title}</CardTitle>
              <CardDescription className="leading-5">{f.description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button asChild variant={f.primary ? "default" : "outline"} className="w-full">
                <a href={f.href} download>
                  <Download className="size-4" />
                  {f.cta}
                </a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="size-5 text-primary" />
            iPhone sharing via Shortcuts
          </CardTitle>
          <CardDescription>
            Share a PDF from Apollo, WhatsApp, Files or Photos straight into Hearth — no
            native app needed. Create an iOS Shortcut with a &quot;Get Contents of URL&quot;
            action:
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1 rounded-lg border bg-muted/50 p-3 font-mono text-xs">
            <p>POST {process.env.NEXT_PUBLIC_APP_URL ?? "https://<your-app>"}/api/documents/upload</p>
            <p>Header: Authorization: Bearer {user?.apiToken ?? "<generate a token below>"}</p>
            <p>Form fields: file = (shared file) · profileId = {profile.id}</p>
            <p>Optional: documentType, source (apollo/whatsapp/camera/files), documentDate</p>
          </div>
          <p className="text-xs text-muted-foreground">
            The token acts as your password for uploads — rotate it if it ever leaks.
            Uploads are still profile-isolated and virus/MIME checked.
          </p>
          <form action={regenerateApiToken}>
            <Button variant="outline" size="sm" type="submit">
              <RefreshCw className="size-4" />
              {user?.apiToken ? "Rotate token" : "Generate token"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
