export type Rules = {
  /** CSS selectors hidden outright. */
  hide: string[];
  /** Ads only recognisable by a text label, e.g. X's "Ad" tag on a post. */
  labelled?: { item: string; container: string; ignore: string; labels: string[] };
};

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
        item: 'article[data-testid="tweet"]',
        container: '[data-testid="cellInnerDiv"]',
        // A post or display name that just says "Ad" is not an ad.
        ignore: '[data-testid="tweetText"], [data-testid="User-Name"]',
        // shortcut: English labels only, add translations when other locales matter.
        labels: ["Ad", "Promoted"],
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
  return { hide: [...GENERIC, ...(site?.hide ?? [])], labelled: site?.labelled };
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
