import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { UploadForm } from "./upload-form";

export default async function UploadPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { profile, profiles } = await getActiveProfile(session.user.id);

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Upload a document</h1>
        <p className="text-sm text-muted-foreground">
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
