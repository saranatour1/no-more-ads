import { AuthClient } from "@convex-dev/auth/browser";
import { ConvexHttpClient } from "convex/browser";
import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { api } from "../../convex/_generated/api";
import { authStorage } from "../authStorage";
import type { Hidden, Post } from "../promoted";

const url = import.meta.env.VITE_CONVEX_URL as string;

/**
 * Runs a backend call as the user signed in via the popup. Signed out, the
 * call is skipped (nothing is sent anywhere) and `signedOut` is returned.
 */
async function asUser<T>(call: (convex: ConvexHttpClient) => Promise<T>, signedOut: T) {
  const anonymous = new ConvexHttpClient(url);
  // Built per request: the popup may have signed in, out, or refreshed since.
  const auth = new AuthClient({
    mode: "spa",
    storage: authStorage,
    storageNamespace: url,
    authApi: {
      refreshSession: (refreshToken) =>
        anonymous.mutation(api.auth.refreshSession, { refreshToken }),
      signOut: async (refreshToken) => {
        await anonymous.mutation(api.auth.signOut, { refreshToken });
      },
    },
  });
  await auth.init();
  const attempt = async (forceRefreshToken: boolean) => {
    const token = await auth.fetchAccessToken({ forceRefreshToken });
    if (token === null) return signedOut;
    const convex = new ConvexHttpClient(url);
    convex.setAuth(token);
    return await call(convex);
  };
  // The stored access token may have expired; retry once with a fresh one.
  return await attempt(false).catch(() => attempt(true));
}

type Message = { posts: Post[] } | { hidden: Hidden[] };

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: Message, _sender, respond) => {
    const work =
      "posts" in message
        ? // Which of these posts are adverts or AI slop?
          asUser((convex) => convex.action(api.jev.judgePosts, { posts: message.posts }), [])
        : // Record the posts just hidden, and add them to the user's total.
          asUser(
            (convex) => convex.mutation(api.stats.recordHidden, { posts: message.hidden }),
            null,
          );
    work.then(respond, (error) => {
      console.error("[no-more-ads] backend call failed:", error);
      respond("posts" in message ? [] : null);
    });
    return true; // The answer is sent asynchronously.
  });
});
