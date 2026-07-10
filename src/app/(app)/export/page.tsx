import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import {
  Cable,
  Download,
  FileJson,
  FileText,
  FolderOpen,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Terminal,
} from "lucide-react";
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const apiToken = user?.apiToken ?? "<generate a token below>";
  const ingestRoot = "/path/to/prescriptions";
  const projectRoot = process.env.VERCEL ? "/path/to/hearth" : process.cwd();
  const mcpEnv = `HEARTH_API_TOKEN=${apiToken}
HEARTH_INGEST_ROOTS=${ingestRoot}
HEARTH_APP_URL=${appUrl}`;
  const mcpConfig = `{
  "mcpServers": {
    "hearth": {
      "command": "npm",
      "args": ["--silent", "run", "mcp:hearth"],
      "cwd": "${projectRoot}",
      "env": {
        "HEARTH_API_TOKEN": "${apiToken}",
        "HEARTH_INGEST_ROOTS": "${ingestRoot}",
        "HEARTH_APP_URL": "${appUrl}"
      }
    }
  }
}`;

  const formats = [
    {
      href: `/api/export/profile/${profile.id}/pdf`,
      icon: FileText,
      title: "Doctor-friendly PDF",
      description:
        "Cover summary, abnormal values, medications, genetics notes, lab history and document index — made to hand to a physician.",
      cta: "Download PDF",
      primary: true,
    },
    {
      href: `/api/export/profile/${profile.id}/json`,
      icon: FileJson,
      title: "Internal JSON",
      description:
        "Complete raw export of this profile's confirmed data — observations, reports, medications, genetics, document metadata.",
      cta: "Download JSON",
    },
    {
      href: `/api/export/profile/${profile.id}/fhir`,
      icon: FileJson,
      title: "FHIR bundle",
      description:
        "FHIR-inspired R4 Bundle (Patient, Observation, DiagnosticReport, DocumentReference, MedicationStatement) including genetics observations.",
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
            <p>POST {appUrl}/api/documents/upload</p>
            <p>Header: Authorization: Bearer {apiToken}</p>
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cable className="size-5 text-primary" />
            MCP ingest setup
          </CardTitle>
          <CardDescription>
            Connect Claude, ChatGPT or another MCP client to process a local folder of
            scanned prescriptions, then submit drafts into Hearth for review.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex gap-3 rounded-lg border bg-background/60 p-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Use this profile</p>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                  {profile.id}
                </p>
              </div>
            </div>
            <div className="flex gap-3 rounded-lg border bg-background/60 p-3">
              <FolderOpen className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Allow one folder</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Set <code>HEARTH_INGEST_ROOTS</code> to the prescription folder path.
                </p>
              </div>
            </div>
            <div className="flex gap-3 rounded-lg border bg-background/60 p-3">
              <Terminal className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Run locally</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  npm run mcp:hearth
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="grid gap-2">
              <p className="text-sm font-medium">Environment</p>
              <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/50 p-3 text-xs leading-5">
                <code>{mcpEnv}</code>
              </pre>
            </div>
            <div className="grid gap-2">
              <p className="text-sm font-medium">MCP client config</p>
              <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/50 p-3 text-xs leading-5">
                <code>{mcpConfig}</code>
              </pre>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
            Ask the client to use Hearth MCP, scan the folder, upload each file as
            <code>documentType=prescription</code>, extract with{" "}
            <code>hearth_get_extraction_schema</code>, submit with{" "}
            <code>hearth_submit_extraction_result</code>, and return the review URLs. Do
            not ask it to accept extracted items.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
