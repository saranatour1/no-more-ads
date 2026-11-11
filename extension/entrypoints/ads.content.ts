import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { rulesFor } from "../rules";

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
      const posts = JSON.parse((event as CustomEvent<string>).detail);
      void browser.runtime.sendMessage({ posts }).then((verdicts: unknown[]) => {
        document.dispatchEvent(
          new CustomEvent("nma-verdicts", { detail: JSON.stringify(verdicts) }),
        );
      });
    });
    // Hidden posts are recorded against the user's account on the backend.
    document.addEventListener("nma-hidden", (event) => {
      const hidden = JSON.parse((event as CustomEvent<string>).detail);
      void browser.runtime.sendMessage({ hidden });
    });

    if (labelled === undefined) return;

    const { item, container, ignore, labels } = labelled;
    let queued = false;
    const sweep = () => {
      queued = false;
      for (const el of document.querySelectorAll<HTMLElement>(item)) {
        const isAd = [...el.querySelectorAll("span")].some(
          (span) => labels.includes(span.textContent ?? "") && span.closest(ignore) === null,
        );
        if (isAd) (el.closest<HTMLElement>(container) ?? el).style.display = "none";
      }
    };
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(sweep);
    }).observe(document.documentElement, { childList: true, subtree: true });
  },
});
