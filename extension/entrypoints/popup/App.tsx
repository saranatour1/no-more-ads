import { useEffect, useState } from "react";
import { Button } from "@@/components/ui/button";
import { ItemGroup } from "@@/components/ui/item";
import { useConvexAuth, useQuery } from "convex/react";
import { browser } from "wxt/browser";
import { api } from "../../../convex/_generated/api";
import SiteRow from "../../SiteRow.tsx";
import { DEFAULT_SITES, setSites, syncSites } from "../../sites";

// shortcut: a flat guess at the time one ad costs a reader, measure it if the figure starts to matter.
const SECONDS_PER_AD = 3;

/** "45 sec" / "12 min" / "3 hr". */
function timeSaved(ads: number): string {
  const seconds = ads * SECONDS_PER_AD;
  if (seconds < 60) return `${seconds} sec`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds / 3600)} hr`;
}

// The popup is the quick view: the count and the main switches. Everything
// else (custom sites, blocked words, hidden posts, account) is in Settings.
export default function App() {
  // Hosts the user has granted access to; null while loading.
  const [enabled, setEnabled] = useState<string[] | null>(null);
  const [failing, setFailing] = useState(false);
  const { isLoading, isAuthenticated } = useConvexAuth();
  // Null while loading or signed out: the total is kept per account.
  const dodged = useQuery(api.stats.myDodged) ?? null;

  useEffect(() => {
    void syncSites().then(setEnabled);
    void browser.storage.local
      .get("backendFailure")
      .then((items) => setFailing(items.backendFailure !== undefined));
  }, []);

  async function reload() {
    // Re-register scripts first so the reloaded page gets the current ones.
    await syncSites();
    // Restarts the whole extension: the browser keeps running the old
    // background script until this happens, whatever is on disk. The
    // restarted background then reloads the tab (see background.ts).
    browser.runtime.reload();
  }

  return (
    <main className="mx-auto w-[20rem] p-4 text-sm">
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="font-heading text-base font-semibold">No More Ads</h1>
        {dodged !== null && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{dodged}</span> hidden, about{" "}
            {timeSaved(dodged)} saved
          </p>
        )}
      </header>

      {failing && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          The extension couldn't reach its backend, so posts aren't being judged or counted. Press
          Reload.
        </p>
      )}
      {!isLoading && !isAuthenticated && (
        <p className="mt-2 text-xs text-muted-foreground">
          Sign in from Settings to judge and count posts on X.
        </p>
      )}

      <ItemGroup className="mt-3 gap-2">
        {DEFAULT_SITES.map((site) => (
          <SiteRow
            key={site.name}
            name={site.name}
            icon={site.icon}
            checked={enabled?.includes(site.hosts[0]) ?? false}
            onChange={(on) => void setSites(site.hosts, on).then(setEnabled)}
          />
        ))}
      </ItemGroup>

      <footer className="mt-3 flex justify-between gap-2">
        <Button variant="outline" size="sm" onClick={() => void browser.runtime.openOptionsPage()}>
          Settings
        </Button>
        <Button variant="outline" size="sm" onClick={() => void reload()}>
          Reload
        </Button>
      </footer>
    </main>
  );
}
