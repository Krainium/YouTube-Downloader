/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep undici out of webpack bundling entirely — it uses node: scheme imports
  // (node:assert, node:async_hooks, etc.) that webpack 5 can't resolve.
  // The server loads it from node_modules at runtime; the client never needs it.
  experimental: {
    serverExternalPackages: ["undici"],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        undici: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
