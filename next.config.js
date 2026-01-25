/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile Remotion packages for Next.js compatibility
  transpilePackages: [
    'remotion',
    '@remotion/player',
    '@remotion/preload',
    '@remotion/transitions',
    '@remotion/zod-types',
  ],
  webpack: (config, { isServer }) => {
    // Handle Remotion's video/audio imports
    config.module.rules.push({
      test: /\.(mp4|webm|mp3|wav|ogg)$/,
      type: 'asset/resource',
    });

    return config;
  },
  // Enable experimental features for React 19
  experimental: {
    reactCompiler: false,
    // Allow large file uploads (up to 1GB)
    serverActions: {
      bodySizeLimit: '1gb',
    },
  },
};

module.exports = nextConfig;
