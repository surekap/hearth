import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Protect everything except NextAuth routes, static assets, and PWA files.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|logo.png|icon.png|icons|apple-touch-icon).*)",
  ],
};
