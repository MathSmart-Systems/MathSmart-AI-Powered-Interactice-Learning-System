import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match every request path except static assets and image files, which
     * never need a Supabase session.
     */
    // `api/` is the FastAPI function on Vercel: it checks its own bearer
    // tokens, and a Supabase cookie refresh there would only add latency.
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
