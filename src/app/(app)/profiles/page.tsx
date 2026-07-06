import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { UserPlus } from "lucide-react";
import { auth } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { addProfileAccount, createProfile, updateProfile } from "@/app/actions/profiles";
import { db, schema } from "@/db";
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
  const profileIds = profiles.map((p) => p.id);

  const linkedAccounts = profileIds.length
    ? await db
        .select({
          profileId: schema.profileAccounts.profileId,
          userId: schema.profileAccounts.userId,
          role: schema.profileAccounts.role,
          email: schema.users.email,
          name: schema.users.name,
        })
        .from(schema.profileAccounts)
        .innerJoin(schema.users, eq(schema.profileAccounts.userId, schema.users.id))
        .where(inArray(schema.profileAccounts.profileId, profileIds))
    : [];

  const accountsByProfile = new Map<string, typeof linkedAccounts>();
  for (const account of linkedAccounts) {
    const accounts = accountsByProfile.get(account.profileId) ?? [];
    accounts.push(account);
    accountsByProfile.set(account.profileId, accounts);
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Family profiles</h1>
        <p className="text-sm text-muted-foreground">
          Each person&apos;s health records are kept strictly separate.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {profiles.map((p) => {
          const accounts = accountsByProfile.get(p.id) ?? [];
          const canManage =
            p.userId === session.user.id ||
            accounts.some((a) => a.userId === session.user.id && a.role === "manager");

          return (
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
              <CardContent className="grid gap-4">
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

                {canManage && (
                  <details>
                    <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                      Accounts
                    </summary>
                    <div className="mt-3 grid gap-3">
                      {accounts.length > 0 && (
                        <div className="grid gap-2">
                          {accounts.map((account) => (
                            <div
                              key={account.userId}
                              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                            >
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{account.name}</span>
                                <span className="block truncate text-muted-foreground">
                                  {account.email}
                                </span>
                              </span>
                              <Badge variant={account.role === "manager" ? "default" : "outline"}>
                                {account.role}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}

                      <form action={addProfileAccount.bind(null, p.id)} className="grid gap-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="grid gap-1.5">
                            <Label>Email</Label>
                            <Input name="email" type="email" autoComplete="email" required />
                          </div>
                          <div className="grid gap-1.5">
                            <Label>Temporary password</Label>
                            <Input
                              name="password"
                              type="password"
                              autoComplete="new-password"
                              minLength={8}
                              required
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <Label>Access</Label>
                            <select
                              name="role"
                              defaultValue="member"
                              className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                            >
                              <option value="member">member</option>
                              <option value="manager">manager</option>
                            </select>
                          </div>
                        </div>
                        <Button type="submit" size="sm" className="justify-self-start">
                          <UserPlus className="size-4" />
                          Add login
                        </Button>
                      </form>
                    </div>
                  </details>
                )}
              </CardContent>
            </Card>
          );
        })}
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
