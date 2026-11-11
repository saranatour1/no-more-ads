import { defineContentScript } from "wxt/utils/define-content-script";
import { type Hidden, type Post, readTimeline } from "../promoted";

export default defineContentScript({
  // Registered from the popup for X only. Runs in the page's own world,
  // because that is the only place X's network responses can be read.
  registration: "runtime",
  world: "MAIN",
  matches: [],
  main() {
    // A constructed sheet is not subject to the page's style CSP.
    const sheet = new CSSStyleSheet();
    document.adoptedStyleSheets.push(sheet);
    const hidePosts = (hidden: Hidden[]) => {
      if (hidden.length === 0) return;
      for (const { id } of hidden) {
        // The rule exists before X renders the post, so it never paints.
        sheet.insertRule(
          `[data-testid="cellInnerDiv"]:has(a[href*="/status/${CSS.escape(id)}"]){display:none!important}`,
        );
      }
      // Recorded by ads.content.ts, which can reach the extension.
      document.dispatchEvent(new CustomEvent("nma-hidden", { detail: JSON.stringify(hidden) }));
    };
    const seen = new Set<string>();
    const fresh = (id: string) => !seen.has(id) && seen.add(id) !== undefined;
    const hide = (body: string) => {
      const { promoted, posts } = readTimeline(body);
      hidePosts(promoted.filter(fresh).map((id) => ({ id, reason: "promoted" })));
      // The rest go to the extension (ads.content.ts) to be judged; this
      // world cannot message it directly.
      const unjudged: Post[] = posts.filter((post) => fresh(post.id));
      if (unjudged.length > 0) {
        document.dispatchEvent(new CustomEvent("nma-posts", { detail: JSON.stringify(unjudged) }));
      }
    };
    document.addEventListener("nma-verdicts", (event) => {
      hidePosts(JSON.parse((event as CustomEvent<string>).detail) as Hidden[]);
    });
    const isApi = (url: string) => url.includes("/graphql/");

    // oxlint-disable-next-line typescript/unbound-method -- re-bound with apply below
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: any[]) {
      if (isApi(String(args[1]))) {
        this.addEventListener("load", () => {
          if (this.responseType === "" || this.responseType === "text") hide(this.responseText);
        });
      }
      return open.apply(this, args as Parameters<typeof open>);
    };

    const fetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await fetch(...args);
      if (isApi(response.url)) {
        // Read a copy, and never let our failure break the page's request.
        await response
          .clone()
          .text()
          .then(hide, () => {});
      }
      return response;
    };
  },
});
