import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["react-force-graph-2d", "force-graph", "d3-force-3d", "three-forcegraph"],
};

export default nextConfig;
