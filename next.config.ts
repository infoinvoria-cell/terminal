import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

const nextConfig: NextConfig = {
  reactStrictMode: false,
  typedRoutes: false,
  transpilePackages: ["react-force-graph-2d", "force-graph", "d3-force-3d", "three-forcegraph"],
  serverExternalPackages: ["canvas"],
  experimental: {
    optimizeCss: true,
    optimizePackageImports: ["lucide-react", "recharts"],
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
