import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 서버 액션에서 큰 페이로드(보고서 등) 허용
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
