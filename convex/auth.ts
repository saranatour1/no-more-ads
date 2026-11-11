import { setupAnonymous } from "@convex-dev/auth/methods/anonymous/server";
import { setupGithub } from "@convex-dev/auth/methods/github/server";
import { setupConvexAuth } from "@convex-dev/auth/server";
import { components, internal } from "./_generated/api";

const auth = setupConvexAuth({ component: components.auth });
export const { signOut, refreshSession, isAuthenticated } = auth;

export const { startSignInWithGithub, completeSignInWithGithub } = setupGithub(auth, {
  component: components.authGithub,
  allowedRedirectOrigins: [
    "http://localhost:5173",
    // The extension's identity redirect origin(s), comma-separated, e.g.
    // https://<extension-id>.chromiumapp.org (differs per browser and install).
    ...(process.env.AUTH_EXTENSION_ORIGINS?.split(",") ?? []),
  ],
}).attachUserCallbacks({ createUser: internal.users.createUser });

export const { signInAnonymously } = setupAnonymous(auth, {
  component: components.authAnonymous,
}).attachUserCallbacks({ createUser: internal.users.createGuest });
