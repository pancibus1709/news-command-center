import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Everything on the board is live upstream data with its own in-process
  // TTL cache (src/lib/cache.ts), so Next's cache components layer is off.
  cacheComponents: false,
  turbopack: {
    root: path.resolve(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
