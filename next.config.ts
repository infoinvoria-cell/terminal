import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

const nextConfig: NextConfig = {
  transpilePackages: ["react-force-graph-2d", "force-graph", "d3-force-3d", "three-forcegraph"],
  serverExternalPackages: ["canvas"],
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  async headers() {
    return [
      {
        source: "/(branding|assets|fonts)/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/:file([^/]+\\.(?:png|jpg|jpeg|webp|avif|svg|ico|woff|woff2|ttf|otf))",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/api/brain-graph/:path*",
        headers: [{ key: "Cache-Control", value: "public, s-maxage=3600, stale-while-revalidate=3600" }],
      },
      {
        source: "/api/signal/:path*",
        headers: [{ key: "Cache-Control", value: "public, s-maxage=60, stale-while-revalidate=60" }],
      },
      {
        source: "/api/monitoring/:path*",
        headers: [{ key: "Cache-Control", value: "public, s-maxage=60, stale-while-revalidate=60" }],
      },
      {
        source: "/generated/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
