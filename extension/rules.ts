export type Rules = {
  /** CSS selectors hidden outright. */
  hide: string[];
  /**
   * Ads only recognisable by a visible label such as "Ad" or "Sponsored":
   * the box to hide around the label, and where a label doesn't count.
   */
  labelled: { container: string; ignore?: string };
};

// shortcut: English labels only, add translations when other locales matter.
export const AD_LABELS = ["Ad", "Ads", "Advertisement", "Sponsored", "Promoted"];

// shortcut: a guess at what wraps one item on an unknown site, give a site its own entry in SITES when this hides too much or too little.
const GENERIC_CONTAINER = 'article, [role="article"], li, aside';

// Common ad-network markup, hidden on every enabled site.
const GENERIC = [
  "ins.adsbygoogle",
  '[id^="div-gpt-ad"]',
  '[id^="google_ads_"]',
  "[data-ad-slot]",
  'iframe[src*="doubleclick.net"]',
  'iframe[src*="googlesyndication.com"]',
];

const SITES: [RegExp, Partial<Rules>][] = [
  [
    /(^|\.)(x|twitter)\.com$/,
    {
      labelled: {
        container: '[data-testid="cellInnerDiv"]',
        // A post or display name that just says "Ad" is not an ad.
        ignore: '[data-testid="tweetText"], [data-testid="User-Name"]',
      },
    },
  ],
  [
    /(^|\.)facebook\.com$/,
    {
      // shortcut: unverified best guess, Facebook obfuscates its "Sponsored" label.
      hide: [
        '[role="article"]:has(a[href*="/ads/about"])',
        '[role="article"]:has([aria-label="Sponsored"])',
        '[data-pagelet="RightRail"] div:has(> div > [aria-label="Sponsored"])',
      ],
    },
  ],
  [
    /(^|\.)reddit\.com$/,
    {
      // Reddit's own elements for promoted posts, on the new and the old site.
      hide: [
        "shreddit-ad-post",
        "shreddit-comments-page-ad",
        "shreddit-comment-tree-ad",
        "shreddit-sidebar-ad",
        ".promotedlink",
      ],
      labelled: {
        container: "shreddit-post, article, .thing",
        // A post title or body that just says "Ad" is not an ad.
        ignore: '[slot="title"], [slot="text-body"], .title, .usertext-body',
      },
    },
  ],
  [
    /(^|\.)linkedin\.com$/,
    {
      // Checked against the feed's markup in Nov 2026. Its class names are
      // generated, so only roles, test ids and titles are used.
      hide: [
        // The side-column ad and the box drawn around it.
        'div:has(> iframe[title="advertisement"])',
        ".ad-banner-container",
        "[data-ad-banner]",
      ],
      labelled: {
        // A feed post is a list item; the class names are for the older site.
        container: '[role="listitem"], .feed-shared-update-v2, .occludable-update',
        // The post's own words and its comments don't count, only LinkedIn's label.
        ignore:
          '[data-testid="expandable-text-box"], .update-components-text, .comments-comments-list',
      },
    },
  ],
  [
    /(^|\.)google\.[a-z.]+$/,
    {
      hide: [
        "#tads",
        "#tadsb",
        "#bottomads",
        "#atvcap",
        "[data-text-ad]",
        ".commercial-unit-desktop-top",
        ".commercial-unit-desktop-rhs",
      ],
    },
  ],
];

export function rulesFor(hostname: string): Rules {
  const site = SITES.find(([host]) => host.test(hostname))?.[1];
  return {
    hide: [...GENERIC, ...(site?.hide ?? [])],
    labelled: site?.labelled ?? { container: GENERIC_CONTAINER },
  };
}

/** "https://www.Example.com/page" -> "example.com"; null when it isn't a site. */
export function parseHost(input: string): string | null {
  const text = input.trim();
  try {
    const host = new URL(text.includes("://") ? text : `https://${text}`).hostname.replace(
      /^www\./,
      "",
    );
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}
