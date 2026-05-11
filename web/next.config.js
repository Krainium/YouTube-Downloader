/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["undici"],

  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
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
        ...(Array.isArray(existingExternals)
          ? existingExternals
          : [existingExternals]),
        ({ request }, callback) => {
          if (request === "undici") return callback(null, "commonjs undici");
          // ffmpeg packages are client-only — never bundle on server
          if (request?.startsWith("@ffmpeg/")) return callback(null, `commonjs ${request}`);
          callback();
        },
      ];
    }
    return config;
  },

  // Allow the ffmpeg WASM binary to be served (large file, no size warning)
  experimental: {
    largePageDataBytes: 512 * 1024,
  },
};

module.exports = nextConfig;
