import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { createProfile, updateProfile } from "@/app/actions/profiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const RELATIONSHIPS = ["self", "spouse", "child", "parent", "other"] as const;
const SEXES = ["male", "female", "other", "unknown"] as const;

function ProfileFields({
  defaults,
}: {
  defaults?: {
    displayName: string;
    relationship: string;
    dateOfBirth: string | null;
    sexAtBirth: string;
    bloodGroup: string | null;
  };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label>Name</Label>
        <Input name="displayName" required defaultValue={defaults?.displayName ?? ""} />
      </div>
      <div className="grid gap-1.5">
        <Label>Relationship</Label>
        <select
          name="relationship"
          defaultValue={defaults?.relationship ?? "other"}
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
        >
          {RELATIONSHIPS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label>Date of birth</Label>
        <Input name="dateOfBirth" type="date" defaultValue={defaults?.dateOfBirth ?? ""} />
      </div>
      <div className="grid gap-1.5">
        <Label>Sex at birth</Label>
        <select
          name="sexAtBirth"
          defaultValue={defaults?.sexAtBirth ?? "unknown"}
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
        >
          {SEXES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label>Blood group</Label>
        <Input name="bloodGroup" placeholder="e.g. O+" defaultValue={defaults?.bloodGroup ?? ""} />
      </div>
    </div>
  );
}

export default async function ProfilesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { profiles, profile: active } = await getActiveProfile(session.user.id);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Family profiles</h1>
        <p className="text-sm text-muted-foreground">
          Each person&apos;s health records are kept strictly separate.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {profiles.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {p.displayName}
                {p.id === active?.id && <Badge>active</Badge>}
              </CardTitle>
              <CardDescription className="capitalize">
                {p.relationship}
                {p.dateOfBirth ? ` · born ${p.dateOfBirth}` : ""}
                {p.bloodGroup ? ` · ${p.bloodGroup}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <details>
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                  Edit
                </summary>
                <form action={updateProfile.bind(null, p.id)} className="mt-3 grid gap-3">
                  <ProfileFields
                    defaults={{
                      displayName: p.displayName,
                      relationship: p.relationship,
                      dateOfBirth: p.dateOfBirth,
                      sexAtBirth: p.sexAtBirth,
                      bloodGroup: p.bloodGroup,
                    }}
                  />
                  <Button type="submit" size="sm" className="justify-self-start">
                    Save
                  </Button>
                </form>
              </details>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add family member</CardTitle>
          <CardDescription>
            Creates a new isolated profile and switches to it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createProfile} className="grid gap-3">
            <ProfileFields />
            <Button type="submit" className="justify-self-start">
              Add profile
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
