/** @type {import('next').NextConfig} */
// build: 1789067520521
const nextConfig = {
  output: process.env.VERCEL ? undefined : "standalone",
  serverExternalPackages: ["undici"],

  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false, path: false, crypto: false,
      };
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^undici$/,
          (resource) => { resource.request = false; }
        )
      );
    } else {
      const existingExternals = config.externals ?? [];
      config.externals = [
        ...(Array.isArray(existingExternals) ? existingExternals : [existingExternals]),
        ({ request }, callback) => {
          if (request === "undici") return callback(null, "commonjs undici");
          if (request?.startsWith("node:")) return callback(null, `commonjs ${request}`);
          if (request?.startsWith("@ffmpeg/")) return callback(null, `commonjs ${request}`);
          callback();
        },
      ];
    }
    return config;
  },

  experimental: { largePageDataBytes: 512 * 1024 },
};

module.exports = nextConfig;
