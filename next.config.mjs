/**
 * On Vercel, `/api/v1/*` is served by the Python function in `api/index.py`
 * (see vercel.json) on the same domain as this app.
 *
 * In development the API runs separately on port 8000 (`npm run dev`). Most
 * requests reach it through NEXT_PUBLIC_API_BASE_URL; this rewrite also lets a
 * same-origin `/api/v1` request work locally, the way it does when deployed.
 * It is not applied to production builds.
 */

const LOCAL_API_ORIGIN = "http://127.0.0.1:8000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [{ source: "/api/v1/:path*", destination: `${LOCAL_API_ORIGIN}/api/v1/:path*` }];
  },
};

export default nextConfig;
