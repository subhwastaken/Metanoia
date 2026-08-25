import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/scraper',
        destination: '/scrapers',
        permanent: true,
      },
      {
        source: '/scraper/:path*',
        destination: '/scrapers/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
