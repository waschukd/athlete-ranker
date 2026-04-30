const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
}

// Wrap the config so the Sentry Webpack plugin can:
//  - upload source maps (only when SENTRY_AUTH_TOKEN is set, normally
//    in CI / Vercel env)
//  - tunnel events through /monitoring to dodge ad blockers in the
//    browser
//  - hide source maps from the public bundle so customers can't see
//    your server logic from devtools
const sentryWebpackPluginOptions = {
  silent: true,                          // less noise in build output
  hideSourceMaps: true,
  disableLogger: true,
  // Vercel-aware: org + project come from env so we don't hardcode.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // No-op when auth token is missing (e.g. local builds): plugin
  // skips upload instead of failing.
};

module.exports = process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
  : nextConfig;
