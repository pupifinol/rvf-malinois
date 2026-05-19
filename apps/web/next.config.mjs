/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The app runs autoalojado in production (engineering doc §35), so the
  // standalone output makes the Docker image small and self-contained.
  output: 'standalone',
  // Workspace packages get transpiled by Next instead of being prebuilt.
  // F0 ships @rvf/ui as raw TSX for fast iteration.
  transpilePackages: ['@rvf/ui', '@rvf/types'],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
