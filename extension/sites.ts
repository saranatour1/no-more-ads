import {
  Facebook01Icon,
  GoogleIcon,
  Linkedin01Icon,
  NewTwitterIcon,
  RedditIcon,
} from "@hugeicons/core-free-icons";
import { browser } from "wxt/browser";

export const DEFAULT_SITES = [
  {
    name: "X",
    hosts: ["x.com", "twitter.com"],
    icon: NewTwitterIcon,
  },
  {
    name: "Facebook",
    hosts: ["facebook.com"],
    icon: Facebook01Icon,
  },
  {
    name: "Reddit",
    hosts: ["reddit.com"],
    icon: RedditIcon,
  },
  {
    name: "LinkedIn",
    hosts: ["linkedin.com"],
    icon: Linkedin01Icon,
  },
  {
    name: "Google",
    hosts: ["google.com"],
    icon: GoogleIcon,
  },
];

const SCRIPT_ID = "ads";
const X_SCRIPT_ID = "x-network";
const X_HOSTS = DEFAULT_SITES[0].hosts;
const PREFIX = "*://*.";
const SUFFIX = "/*";
const pattern = (host: string) => `${PREFIX}${host}${SUFFIX}`;

/**
 * The granted host permissions are the single source of truth for which
 * sites are on. This re-registers the ad-hiding script to match them and
 * returns the enabled hosts.
 */
export async function syncSites(): Promise<string[]> {
  const { origins = [] } = await browser.permissions.getAll();
  const matches = origins.filter((o) => o.startsWith(PREFIX) && o.endsWith(SUFFIX));
  // Separately, so a script that was never registered doesn't block the other.
  for (const id of [SCRIPT_ID, X_SCRIPT_ID]) {
    await browser.scripting.unregisterContentScripts({ ids: [id] }).catch(() => {});
  }
  const xMatches = matches.filter((m) => X_HOSTS.some((host) => m === pattern(host)));
  const scripts = [
    { id: SCRIPT_ID, js: ["/content-scripts/ads.js"], matches },
    // Reads X's own network responses, which only the page's world can see.
    { id: X_SCRIPT_ID, js: ["/content-scripts/x-network.js"], matches: xMatches, world: "MAIN" },
  ] as const;
  for (const script of scripts) {
    if (script.matches.length === 0) continue;
    const registration = [{ ...script, js: [...script.js], runAt: "document_start" as const }];
    // The popup, this page and the background can sync at the same moment; if
    // another one registered the script first ("Duplicate script ID"), update it.
    await browser.scripting
      .registerContentScripts(registration)
      .catch(() => browser.scripting.updateContentScripts(registration));
  }
  return matches.map((m) => m.slice(PREFIX.length, -SUFFIX.length));
}

/** Ask for (or give back) access to the hosts, then sync. */
export async function setSites(hosts: string[], enabled: boolean): Promise<string[]> {
  const origins = hosts.map(pattern);
  // Must be the first await: browsers only show the prompt during the click.
  await (enabled
    ? browser.permissions.request({ origins })
    : browser.permissions.remove({ origins }));
  return syncSites();
}
