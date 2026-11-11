import type { TokenStorage } from "@convex-dev/auth/browser";
import { browser } from "wxt/browser";

// Extension storage instead of localStorage, so the background script (which
// has no localStorage in Chrome) shares the popup's sign-in.
export const authStorage: TokenStorage = {
  getItem: async (key) => (await browser.storage.local.get(key))[key] as string | undefined,
  setItem: (key, value) => browser.storage.local.set({ [key]: value }),
  removeItem: (key) => browser.storage.local.remove(key),
};
