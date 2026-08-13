import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

const nextConfig: NextConfig = {
  // Separate distDir for production builds prevents Turbopack dev cache contamination.
  // Set NEXT_BUILD_DIST=.next-build when running `npm run build` locally.
  // Vercel bypasses this via vercel.json buildCommand: "next build" (no env override).
  distDir: process.env.NEXT_BUILD_DIST || ".next",
  reactStrictMode: false,
  typedRoutes: false,
  transpilePackages: ["react-force-graph-2d", "force-graph", "d3-force-3d", "three-forcegraph"],
  serverExternalPackages: ["canvas"],
  experimental: {
    optimizeCss: true,
    optimizePackageImports: ["lucide-react", "recharts"],
    // Disable Turbopack persistent filesystem cache to prevent LevelDB self-compaction outages.
    // Self-compaction bursts block the HTTP handler for 2-3 min even with no build running.
    turbopackFileSystemCacheForDev: false,
  },
  outputFileTracingIncludes: {
    "**": ["./src/data/capitalife/**/*.json"],
  },
  async headers() {
    const immutableAssetHeaders = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];

    return [
      {
        source: "/branding/:path*",
        headers: immutableAssetHeaders,
      },
      {
        source: "/:path*\\.(png|jpg|jpeg|webp|avif|gif|svg|ico)",
        headers: immutableAssetHeaders,
      },
      {
        source: "/:path*\\.(woff|woff2|ttf|otf|eot)",
        headers: immutableAssetHeaders,
      },
      {
        source: "/generated/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
