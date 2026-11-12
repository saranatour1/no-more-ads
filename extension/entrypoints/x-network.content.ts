import { defineContentScript } from "wxt/utils/define-content-script";
import { type Hidden, isBlocked, type Post, readTimeline, saysAd } from "../promoted";

export default defineContentScript({
  // Registered from the popup for X only. Runs in the page's own world,
  // because that is the only place X's network responses can be read.
  registration: "runtime",
  world: "MAIN",
  matches: [],
  main() {
    // Constructed sheets are not subject to the page's style CSP.
    const sheet = new CSSStyleSheet();
    document.adoptedStyleSheets.push(sheet);
    const rule = (id: string, style: string) =>
      `[data-testid="cellInnerDiv"]:has(a[href*="/status/${CSS.escape(id)}"]){${style}}`;

    const hidePosts = (hidden: Hidden[]) => {
      if (hidden.length === 0) return;
      // The rule exists before X renders the post, so it never paints.
      for (const { id } of hidden) sheet.insertRule(rule(id, "display:none!important"));
      // Recorded by ads.content.ts, which can reach the extension.
      document.dispatchEvent(new CustomEvent("nma-hidden", { detail: JSON.stringify(hidden) }));
    };

    // Posts waiting for a verdict are kept invisible (but still take up
    // their space, so the timeline doesn't jump) until the answer arrives.
    const held = new Map<number, CSSStyleSheet>();
    let batches = 0;
    const release = (batch: number) => {
      const holding = held.get(batch);
      if (holding === undefined) return;
      held.delete(batch);
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== holding);
    };

    // The user's blocked words and sites, handed over by ads.content.ts.
    let blocked: string[] = [];
    document.addEventListener("nma-blocked", (event) => {
      blocked = JSON.parse((event as CustomEvent<string>).detail) as string[];
    });
    // Ask for them in case that script started before this one was listening.
    document.dispatchEvent(new CustomEvent("nma-ready"));

    const seen = new Set<string>();
    const fresh = (id: string) => !seen.has(id) && seen.add(id) !== undefined;
    const hide = (body: string) => {
      const { promoted, posts } = readTimeline(body);
      const unseen = posts.filter((post) => fresh(post.id));
      // Decided here in the page, with no backend call: X's own ad marker,
      // posts whose text says they are an ad, and the user's blocked terms.
      const local = (post: Post): Hidden["reason"] | null =>
        saysAd(post.text) ? "ad" : isBlocked(post, blocked) ? "blocked" : null;
      hidePosts([
        ...promoted.filter(fresh).map((id): Hidden => ({ id, reason: "promoted" })),
        ...unseen.flatMap((post): Hidden[] => {
          const reason = local(post);
          return reason === null ? [] : [{ id: post.id, reason }];
        }),
      ]);
      // Only the rest go to the extension (ads.content.ts) to be judged, and
      // only the fields the backend takes; this world cannot message it directly.
      const unjudged = unseen
        .filter((post) => local(post) === null)
        .map(({ id, text, video }) => ({ id, text, video }));
      if (unjudged.length === 0) return;
      const batch = ++batches;
      const holding = new CSSStyleSheet();
      for (const { id } of unjudged) holding.insertRule(rule(id, "visibility:hidden!important"));
      held.set(batch, holding);
      document.adoptedStyleSheets.push(holding);
      // Never leave posts invisible if no answer comes (extension off or reloaded).
      setTimeout(() => release(batch), 4000);
      document.dispatchEvent(
        new CustomEvent("nma-posts", { detail: JSON.stringify({ batch, posts: unjudged }) }),
      );
    };
    document.addEventListener("nma-verdicts", (event) => {
      const { batch, verdicts } = JSON.parse((event as CustomEvent<string>).detail) as {
        batch: number;
        verdicts: Hidden[];
      };
      // Hide first, then release, so a judged ad never shows in between.
      hidePosts(verdicts);
      release(batch);
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
