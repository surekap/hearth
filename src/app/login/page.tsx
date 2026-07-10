import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: "/",
      });
    } catch (e) {
      if (e instanceof AuthError) {
        redirect("/login?error=1");
      }
      throw e;
    }
  }

  return (
    <main className="health-gradient relative flex min-h-svh items-center justify-center overflow-hidden p-4">
      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="sr-only">Hearth</h1>
          <div className="mx-auto flex max-w-sm items-center justify-center overflow-hidden rounded-lg bg-white/96 p-2 shadow-2xl shadow-black/18">
            <Image
              src="/logo.png"
              alt="Hearth. Your health. Your people. Your home."
              width={320}
              height={160}
              priority
              className="h-28 w-full object-cover object-center"
            />
          </div>
          <p className="mt-4 text-sm text-white/72">Your family&apos;s health, kept close.</p>
        </div>

        <div className="rounded-lg border border-white/15 bg-card/95 p-6 shadow-2xl shadow-black/20 backdrop-blur">
          <form action={login} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {error && (
              <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Invalid email or password.
              </p>
            )}
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-white/62">
          Need an account?{" "}
          <Link href="/signup" className="font-medium text-white underline-offset-4 hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
