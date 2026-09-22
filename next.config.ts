import type { NextConfig } from 'next';

/**
 * Plain static files, so GitHub Pages can host the site. On a project site the app lives
 * under /<repo>, which the deploy workflow passes in as NEXT_PUBLIC_BASE_PATH.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, '') || undefined;

const nextConfig: NextConfig = {
  output: 'export',
  // Each page becomes folder/index.html, which static hosts serve even when an id has a dot in it.
  trailingSlash: true,
  basePath,
  poweredByHeader: false,
};

export default nextConfig;
