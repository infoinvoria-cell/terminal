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
    const immutableAssetHeaders = [
      { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
    ];

    return [
      // Note: /_next/static/* is managed by Next.js automatically (immutable).
      // Public branding/icons
      {
        source: "/branding/:path*",
        headers: immutableAssetHeaders,
      },
      // Public image assets
      {
        source: "/:path*\\.(png|jpg|jpeg|webp|avif|gif|svg|ico)",
        headers: immutableAssetHeaders,
      },
      {
        source: "/:path*\\.(woff|woff2|ttf|otf|eot)",
        headers: immutableAssetHeaders,
      },
      // Dynamic generated data: no cache
      {
        source: "/generated/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
