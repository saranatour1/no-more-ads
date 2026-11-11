import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "extension",
  manifestVersion: 3,
  // Dev mode doesn't open a blank browser: load .output/chrome-mv3-dev once in
  // your own Chrome (where you're logged in to X) and it reloads on every save.
  webExt: { disabled: true },
  manifest: ({ browser }) => ({
    name: "No More Ads",
    permissions: ["identity", "scripting", "storage"],
    // Nothing is granted at install: the user turns sites on one by one.
    optional_host_permissions: ["*://*/*"],
    // Firefox needs a fixed id for a stable identity redirect URL.
    ...(browser === "firefox" && {
      browser_specific_settings: { gecko: { id: "no-more-ads@example.com" } },
    }),
  }),
  vite: () => ({ plugins: [react(), tailwindcss()] }),
});
