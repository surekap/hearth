import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { Badge } from "@/components/ui/badge";
import { UploadForm } from "./upload-form";

export default async function UploadPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { profile, profiles } = await getActiveProfile(session.user.id);

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div className="text-center sm:text-left">
        <Badge className="mb-2 bg-accent text-accent-foreground" variant="secondary">
          Intake
        </Badge>
        <h1 className="text-3xl font-semibold">Upload a document</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Lab reports, prescriptions, imaging and specialist reports. PDF or photo.
        </p>
      </div>
      <UploadForm
        profiles={profiles.map((p) => ({ id: p.id, displayName: p.displayName }))}
        defaultProfileId={profile?.id ?? ""}
      />
    </div>
  );
}
