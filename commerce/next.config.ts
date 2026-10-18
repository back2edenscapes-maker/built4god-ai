import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [{source:'/:path*',headers:[
      {key:'Referrer-Policy',value:'no-referrer'},
      {key:'X-Content-Type-Options',value:'nosniff'},
      {key:'Content-Security-Policy',value:"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self' https://buy.stripe.com; base-uri 'self'; object-src 'none'"},
    ]}];
  },
};

export default nextConfig;
