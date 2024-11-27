/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation.
 * This is especially useful for Docker builds.
 */
!process.env.SKIP_ENV_VALIDATION && (await import("./src/env.mjs"));

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  images: {
    domains: ["lh3.googleusercontent.com"],
  },
  i18n: {
    locales: ["en"],
    defaultLocale: "en",
  },
  // Force IPv4
  server: {
    host: '127.0.0.1',
    port: 3000
  },
  env: {
    NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3000',
  },
};

export default config;
