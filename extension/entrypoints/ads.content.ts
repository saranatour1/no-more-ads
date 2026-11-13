import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { AD_LABELS, rulesFor } from "../rules";

export default defineContentScript({
  // Registered from the popup, only for sites the user turned on.
  registration: "runtime",
  matches: [],
  main() {
    const { hide, labelled } = rulesFor(location.hostname);
    const style = document.createElement("style");
    style.textContent = `${hide.join(",")}{display:none!important}`;
    document.documentElement.append(style);

    // Relay between the page-world script (x-network), which sees X's posts,
    // and the background, which asks the backend which of them to hide.
    document.addEventListener("nma-posts", (event) => {
      const { batch, posts } = JSON.parse((event as CustomEvent<string>).detail);
      const answer = (verdicts: unknown) =>
        document.dispatchEvent(
          new CustomEvent("nma-verdicts", { detail: JSON.stringify({ batch, verdicts }) }),
        );
      // The posts are held invisible until answered, so a background that is
      // asleep or was reloaded must still get an (empty) answer.
      Promise.resolve()
        .then(() => browser.runtime.sendMessage({ posts }))
        .then(answer, () => answer([]));
    });
    // Hidden posts are recorded against the user's account on the backend.
    document.addEventListener("nma-hidden", (event) => {
      const hidden = JSON.parse((event as CustomEvent<string>).detail);
      Promise.resolve()
        .then(() => browser.runtime.sendMessage({ hidden }))
        .catch(() => {});
    });

    // The user's blocked words and sites are mirrored into extension storage
    // by the popup; pass them to the page-world script, now and on change.
    const sendBlocked = () =>
      void browser.storage.local.get("blockedTerms").then(({ blockedTerms }) => {
        document.dispatchEvent(
          new CustomEvent("nma-blocked", { detail: JSON.stringify(blockedTerms ?? []) }),
        );
      });
    sendBlocked();
    document.addEventListener("nma-ready", sendBlocked);
    browser.storage.onChanged.addListener((changes) => {
      if ("blockedTerms" in changes) sendBlocked();
    });

    // Anything whose visible label is exactly "Ad", "Sponsored", ... is
    // hidden here in the page, on every enabled site, with no backend call.
    const { container, ignore } = labelled;
    // X's posts are counted by x-network, from the network responses.
    const counts = !/(^|\.)(x|twitter)\.com$/.test(location.hostname);
    const counted = new WeakSet<Element>();
    const selectors = hide.join(",");
    // Sites pad labels with non-breaking and zero-width characters, which
    // normalize-space() alone leaves in place.
    const text =
      'normalize-space(translate(., "\u00a0\u200b\u200c\u200d\u200e\u200f\u2060\ufeff", "        "))';
    const labels = `//text()[${AD_LABELS.map((label) => `${text}="${label}"`).join(" or ")}]`;
    let queued = false;
    const sweep = () => {
      queued = false;
      const boxes: Element[] = [];
      const found = document.evaluate(
        labels,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null,
      );
      for (let i = 0; i < found.snapshotLength; i++) {
        const label = found.snapshotItem(i)?.parentElement;
        if (label == null || (ignore !== undefined && label.closest(ignore) !== null)) continue;
        const box = label.closest<HTMLElement>(container);
        if (box !== null) box.style.display = "none";
        if (box !== null) boxes.push(box);
      }
      if (!counts) return;
      // Everything the stylesheet above hides counts too, outermost box only.
      for (const box of document.querySelectorAll(selectors)) {
        if (box.parentElement?.closest(selectors) == null) boxes.push(box);
      }
      const hidden = boxes.flatMap((box) => {
        if (counted.has(box)) return [];
        // The ad's link is what identifies it; an empty ad slot has none and is not an ad.
        const link =
          box.querySelector<HTMLAnchorElement>("a[href]")?.href ??
          box.querySelector("iframe")?.src ??
          (box as HTMLIFrameElement).src ??
          // Reddit keeps a post's link in an attribute; its real links sit in shadow DOM.
          new URL(
            box.getAttribute("permalink") ?? (box.id === "" ? "about:blank" : `#${box.id}`),
            location.href,
          ).href;
        // Not marked until it has a link: ads often fill in after they appear.
        if (!/^https?:/.test(link)) return [];
        counted.add(box);
        return [{ url: link.slice(0, 500), reason: "promoted" as const }];
      });
      if (hidden.length > 0) {
        Promise.resolve()
          .then(() => browser.runtime.sendMessage({ hidden: hidden.slice(0, 200) }))
          .catch(() => {});
      }
    };
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(sweep);
    }).observe(document.documentElement, { childList: true, subtree: true });
  },
});
