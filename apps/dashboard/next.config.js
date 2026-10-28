/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The dashboard never uses next/image. `unoptimized` makes Next answer
  // /_next/image with a 404 before the optimizer runs, which closes the
  // AVIF image-optimizer RCE that Next 14.x leaves unpatched (fixed in 15.5.24).
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
  // No rewrites: the browser calls the API directly. The unused /api/proxy
  // rewrite was removed because Next 14.x has unpatched SSRF and request
  // smuggling advisories in rewrites (fixed only in 15.5.x).
};

module.exports = nextConfig;
