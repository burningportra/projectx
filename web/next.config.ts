import fs from 'fs';
import path from 'path';

let envLocalContent = "web/.env.local not found or unreadable";
try {
  envLocalContent = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8');
} catch (e) {
  // ignore
}
console.log("----------------------------------------------------");
console.log("[next.config.ts] Raw content of .env.local:\n", envLocalContent);
console.log("[next.config.ts] Initial process.env.DATABASE_URL:", process.env.DATABASE_URL);
console.log("----------------------------------------------------");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    ignoreBuildErrors: true,
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  env: {
    // DATABASE_URL should be sourced from .env.local or hosting environment variables directly.
    // Do not re-assign it here from process.env if it might be incorrect at this stage.
    // DATABASE_URL: process.env.DATABASE_URL, 
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
  }
};

// console.log('[next.config.ts] Value from .env.local (should be used by app):', process.env.DATABASE_URL); // Log it again after .env.local should have been processed by Next.js

export default nextConfig;
