/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // monorepo 部署 to Vercel 时,Vercel 自动识别 apps/admin 子目录
  // 无需 transpilePackages(没共享 workspace 包给 admin)
}

export default nextConfig
