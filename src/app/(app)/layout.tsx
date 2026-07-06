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
    <div className="min-h-svh min-w-0 max-w-full overflow-x-clip">
      <header className="sticky top-0 z-40 min-w-0 border-b bg-background/88 shadow-sm shadow-primary/5 backdrop-blur-xl">
        <div className="mx-auto flex min-h-14 w-full max-w-6xl items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-4">
          <Link
            href="/"
            className="group flex min-w-0 shrink items-center gap-2 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
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
          <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
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
        <div className="mx-auto min-w-0 max-w-6xl px-3 sm:px-4">
          <MainNav />
        </div>
      </header>
      <main className="mx-auto min-w-0 w-full max-w-6xl px-4 py-5 pb-8 sm:py-6">{children}</main>
      <OfflineStatus />
    </div>
  );
}
