import { AuthClient } from "@convex-dev/auth/browser";
import { ConvexHttpClient } from "convex/browser";
import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { api } from "../../convex/_generated/api";
import { authStorage } from "../authStorage";
import type { Post, Recorded } from "../promoted";
import { syncSites } from "../sites";

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

// Set while the latest backend call failed; the popup reads it. Holds only a timestamp, never error text.
const FAILURE_KEY = "backendFailure";

type Message = { posts: Pick<Post, "id" | "text" | "video">[] } | { hidden: Recorded[] };

export default defineBackground(() => {
  // Register the page scripts whenever the extension starts or a site is
  // switched on or off, so hiding never depends on the popup having been opened.
  const sync = () => void syncSites().catch((error) => console.error("[no-more-ads]", error));
  sync();
  browser.permissions.onAdded.addListener(sync);
  browser.permissions.onRemoved.addListener(sync);

  // After the extension restarts (the popup's Reload button, or an update),
  // refresh the tab in front so its page gets the current scripts. `url` is
  // only visible for sites the user switched on, so other tabs are left alone.
  browser.runtime.onInstalled.addListener(() => {
    void browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id !== undefined && tab.url !== undefined) void browser.tabs.reload(tab.id);
    });
  });

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
    work.then(
      (answer) => {
        void browser.storage.local.remove(FAILURE_KEY);
        respond(answer);
      },
      (error) => {
        console.error("[no-more-ads] backend call failed:", error);
        void browser.storage.local.set({ [FAILURE_KEY]: Date.now() });
        respond("posts" in message ? [] : null);
      },
    );
    return true; // The answer is sent asynchronously.
  });
});
