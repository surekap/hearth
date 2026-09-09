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
      // Upload and MCP authenticate themselves. OAuth resource metadata is public.
      if ([
        "/api/documents/upload",
        "/api/mcp",
        "/.well-known/oauth-protected-resource/api/mcp",
      ].includes(nextUrl.pathname)) return true;
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
