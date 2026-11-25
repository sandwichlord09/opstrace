/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@opstrace/shared-types', '@opstrace/validation'],
};

export default nextConfig;
