import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // The upload route authenticates itself and must bypass Proxy so large multipart
  // bodies are not cloned and truncated by Proxy's request-body buffer.
  matcher: [
    "/((?!api/auth|api/documents/upload|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|logo.png|icon.png|icons|images|apple-touch-icon).*)",
  ],
};
