/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
  async redirects() {
    return [
      { source: '/admin/taxonomy/industries', destination: '/admin/industries', permanent: true },
      { source: '/admin/taxonomy/industries/:path*', destination: '/admin/industries/:path*', permanent: true },
      { source: '/admin/taxonomy/categories', destination: '/admin/industries/categories', permanent: true },
      { source: '/admin/taxonomy/categories/:path*', destination: '/admin/industries/categories/:path*', permanent: true },
      { source: '/admin/taxonomy/product-types', destination: '/admin/industries/product-types', permanent: true },
      { source: '/admin/taxonomy/product-types/:path*', destination: '/admin/industries/product-types/:path*', permanent: true },
    ];
  },
  async rewrites() {
    const backend = process.env.INTERNAL_API_BASE || 'http://backend:8000';
    return [
      { source: '/media/:path*', destination: `${backend}/media/:path*` },
    ];
  },
};

module.exports = nextConfig;
