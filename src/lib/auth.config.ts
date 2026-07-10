import type { NextAuthConfig } from "next-auth";

// Edge-safe config (no db / bcrypt imports) shared with middleware.
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isLoginPage = nextUrl.pathname.startsWith("/login");
      const isSignupPage = nextUrl.pathname.startsWith("/signup");
      if (isLoginPage || isSignupPage) {
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl));
        return true;
      }
      // The upload endpoint accepts session OR a bearer token (iOS Shortcut);
      // it enforces auth itself, so let it through the middleware.
      if (nextUrl.pathname === "/api/documents/upload") return true;
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) token.userId = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.userId) session.user.id = token.userId as string;
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
