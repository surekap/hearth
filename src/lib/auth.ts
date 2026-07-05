import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { authConfig } from "./auth.config";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await db.query.users.findFirst({
          where: eq(schema.users.email, email.toLowerCase()),
        });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        await db
          .update(schema.users)
          .set({ lastLoginAt: new Date() })
          .where(eq(schema.users.id, user.id));

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
});
