import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    optimizeCss: true,
    optimizePackageImports: ['react', 'react-dom', '@supabase/supabase-js', 'socket.io-client']
  },
  images: {
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
  },
  poweredByHeader: false,
  reactStrictMode: true
}

export default nextConfig
