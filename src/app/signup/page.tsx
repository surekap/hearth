import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { signIn } from "@/lib/auth";
import { setActiveProfileCookie } from "@/lib/active-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const signupSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().email().transform((email) => email.toLowerCase()),
    password: z.string().min(8).max(200),
    confirmPassword: z.string().min(1),
    profileName: z.string().trim().max(100).optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
  });

const ERROR_MESSAGES = {
  invalid: "Check the details and use a password with at least 8 characters.",
  exists: "An account already exists for that email. Sign in instead.",
  failed: "Could not create the account. Please try again.",
} as const;

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: keyof typeof ERROR_MESSAGES }>;
}) {
  const { error } = await searchParams;

  async function signup(formData: FormData) {
    "use server";

    const parsed = signupSchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
      profileName: formData.get("profileName") || undefined,
    });

    if (!parsed.success) redirect("/signup?error=invalid");

    const { name, email, password, profileName } = parsed.data;
    const existing = await db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });
    if (existing) redirect("/signup?error=exists");

    let profileId: string;
    try {
      profileId = await db.transaction(async (tx) => {
        const [user] = await tx
          .insert(schema.users)
          .values({
            email,
            name,
            passwordHash: await bcrypt.hash(password, 12),
          })
          .returning();

        const [profile] = await tx
          .insert(schema.profiles)
          .values({
            userId: user.id,
            displayName: profileName || name,
            relationship: "self",
          })
          .returning();

        return profile.id;
      });
    } catch {
      redirect("/signup?error=failed");
    }

    await setActiveProfileCookie(profileId);

    try {
      await signIn("credentials", {
        email,
        password,
        redirectTo: "/",
      });
    } catch (e) {
      if (e instanceof AuthError) redirect("/signup?error=failed");
      throw e;
    }
  }

  return (
    <main className="health-gradient relative flex min-h-svh items-center justify-center overflow-hidden p-4">
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="sr-only">Create your Hearth account</h1>
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
          <p className="mt-4 text-sm text-white/72">Start your private family health record.</p>
        </div>

        <div className="rounded-lg border border-white/15 bg-card/95 p-6 shadow-2xl shadow-black/20 backdrop-blur">
          <form action={signup} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" autoComplete="name" required />
            </div>
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
              <Label htmlFor="profileName">First profile</Label>
              <Input
                id="profileName"
                name="profileName"
                autoComplete="name"
                placeholder="Leave blank to use your name"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
            </div>
            {error && ERROR_MESSAGES[error] && (
              <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {ERROR_MESSAGES[error]}
              </p>
            )}
            <Button type="submit" className="w-full">
              Create account
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-white/62">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-white underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
