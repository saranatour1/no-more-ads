import { defineApp } from "convex/server";
import { v } from "convex/values";
import auth from "@convex-dev/auth/convex.config.js";
import authAnonymous from "@convex-dev/auth/components/anonymous/convex.config.js";
import aggregate from "@convex-dev/aggregate/convex.config.js";
import shardedCounter from "@convex-dev/sharded-counter/convex.config.js";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import authGithub from "@convex-dev/auth/components/github/convex.config.js";

const app = defineApp({
  env: {
    AUTH_PRIVATE_KEY: v.string(),
    AUTH_JWKS: v.string(),
    AUTH_GITHUB_CLIENT_ID: v.string(),
    AUTH_GITHUB_CLIENT_SECRET: v.string(),
  },
});

app.use(auth, {
  httpPrefix: "/auth",
  env: {
    AUTH_PRIVATE_KEY: app.env.AUTH_PRIVATE_KEY,
    AUTH_JWKS: app.env.AUTH_JWKS,
  },
});

// GitHub's callback URL is `${CONVEX_SITE_URL}/oauth/github/callback`.
app.use(authGithub, {
  httpPrefix: "/oauth/github",
  env: {
    CLIENT_ID: app.env.AUTH_GITHUB_CLIENT_ID,
    CLIENT_SECRET: app.env.AUTH_GITHUB_CLIENT_SECRET,
  },
});

app.use(authAnonymous);
app.use(shardedCounter);
app.use(rateLimiter);
app.use(aggregate);

export default app;
