import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      config.watchOptions = {
        ignored: ['**/*'],
      };
    }
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    });
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push({
          'sherpa-onnx': 'commonjs sherpa-onnx',
        });
      }
    }
    return config;
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};
export default nextConfig;