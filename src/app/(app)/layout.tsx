import { redirect } from "next/navigation";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { auth, signOut } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { ProfileSwitcher } from "@/components/shell/profile-switcher";
import { MainNav } from "@/components/shell/nav";
import { Button } from "@/components/ui/button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { profile, profiles } = await getActiveProfile(session.user.id);

  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-sm text-primary-foreground shadow-sm shadow-primary/30">
              ♥
            </span>
            <span className="font-display text-lg">Hearth</span>
          </Link>
          <div className="flex items-center gap-2">
            <ProfileSwitcher
              profiles={profiles.map((p) => ({
                id: p.id,
                displayName: p.displayName,
                relationship: p.relationship,
              }))}
              activeProfileId={profile?.id ?? null}
            />
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <Button variant="ghost" size="icon-sm" title="Sign out">
                <LogOut className="size-4" />
              </Button>
            </form>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4">
          <MainNav />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
