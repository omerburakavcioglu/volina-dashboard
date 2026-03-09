/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      {
        protocol: "https",
        hostname: "api.vapi.ai",
      },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
