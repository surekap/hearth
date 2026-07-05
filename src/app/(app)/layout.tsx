import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { LogOut } from "lucide-react";
import { auth, signOut } from "@/lib/auth";
import { getActiveProfile } from "@/lib/active-profile";
import { ProfileSwitcher } from "@/components/shell/profile-switcher";
import { MainNav } from "@/components/shell/nav";
import { OfflineStatus } from "@/components/shell/offline-status";
import { Button } from "@/components/ui/button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { profile, profiles } = await getActiveProfile(session.user.id);

  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-40 border-b bg-background/88 shadow-sm shadow-primary/5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-3">
          <Link
            href="/"
            className="group flex min-w-0 items-center gap-2 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="flex size-8 items-center justify-center overflow-hidden rounded-lg bg-white shadow-md shadow-primary/20 transition-transform duration-200 group-hover:-rotate-3 group-hover:scale-105">
              <Image
                src="/icon.png"
                alt=""
                width={32}
                height={32}
                className="size-8 object-cover"
              />
            </span>
            <span className="truncate font-display text-lg font-semibold">Hearth</span>
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
                <span className="sr-only">Sign out</span>
              </Button>
            </form>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4">
          <MainNav />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-24 md:pb-8">{children}</main>
      <OfflineStatus />
    </div>
  );
}
