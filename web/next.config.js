/** @type {import('next').NextConfig} */
const nextConfig = {
  // In Next.js 14.1+, serverExternalPackages is top-level (not under experimental).
  // This tells the server-side webpack to require() undici at runtime, not bundle it.
  serverExternalPackages: ["undici"],

  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // Client build: stub out packages that must never reach the browser.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
      // Also stub undici at the module level for client bundles in case
      // webpack still picks it up through RSC analysis.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^undici$/,
          (resource) => { resource.request = false; }
        )
      );
    } else {
      // Server build: explicitly mark undici as a CommonJS external so
      // webpack emits require('undici') instead of bundling the source.
      const existingExternals = config.externals ?? [];
      config.externals = [
        ...(Array.isArray(existingExternals)
          ? existingExternals
          : [existingExternals]),
        ({ request }, callback) => {
          if (request === "undici") return callback(null, "commonjs undici");
          callback();
        },
      ];
    }
    return config;
  },
};

module.exports = nextConfig;
