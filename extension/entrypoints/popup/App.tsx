import { type FormEvent, useEffect, useState } from "react";
import { Add01Icon, Globe02Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Button } from "@@/components/ui/button";
import { Input } from "@@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@@/components/ui/item";
import { Separator } from "@@/components/ui/separator";
import { Switch } from "@@/components/ui/switch";
import { useConvex, useConvexAuth, useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import { browser } from "wxt/browser";
import { api } from "../../../convex/_generated/api";
import { parseHost } from "../../rules";
import { DEFAULT_SITES, setSites, syncSites } from "../../sites";
import Account from "./Account.tsx";

const DEFAULT_HOSTS = DEFAULT_SITES.flatMap((site) => site.hosts);

// shortcut: a flat guess at the time one ad costs a reader, measure it if the figure starts to matter.
const SECONDS_PER_AD = 3;

const REASONS = {
  promoted: "Ad, marked by X",
  ad: "Advert",
  slop: "AI slop",
};

/** "45 sec" / "12 min" / "3 hr". */
function timeSaved(ads: number): string {
  const seconds = ads * SECONDS_PER_AD;
  if (seconds < 60) return `${seconds} sec`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds / 3600)} hr`;
}

function SiteRow(props: {
  name: string;
  detail?: string;
  icon: IconSvgElement;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Item variant="outline" size="sm">
      <ItemMedia variant="icon">
        <HugeiconsIcon icon={props.icon} aria-hidden />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{props.name}</ItemTitle>
        {props.detail !== undefined && <ItemDescription>{props.detail}</ItemDescription>}
      </ItemContent>
      <ItemActions>
        <Switch
          aria-label={`Hide ads on ${props.name}`}
          checked={props.checked}
          onCheckedChange={props.onChange}
        />
      </ItemActions>
    </Item>
  );
}

export default function App() {
  // Hosts the user has granted access to; null while loading.
  const [enabled, setEnabled] = useState<string[] | null>(null);
  const [changed, setChanged] = useState(false);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [failing, setFailing] = useState(false);

  // Null while loading or signed out: the total is kept per account.
  const dodged = useQuery(api.stats.myDodged) ?? null;

  // One-shot query, not useQuery: a live subscription would make Refresh a no-op.
  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const [hidden, setHidden] = useState<FunctionReturnType<typeof api.stats.myHidden>>(null);
  async function loadHidden() {
    setHidden(await convex.query(api.stats.myHidden, {}));
  }

  useEffect(() => {
    void syncSites().then(setEnabled);
    void browser.storage.local
      .get("backendFailure")
      .then((items) => setFailing(items.backendFailure !== undefined));
  }, []);

  // Auth is restored asynchronously, so load once the client is signed in.
  useEffect(() => {
    if (isAuthenticated) void convex.query(api.stats.myHidden, {}).then(setHidden);
  }, [convex, isAuthenticated]);

  async function reloadTab() {
    // Re-register scripts first so the reloaded page gets the current ones.
    await syncSites();
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== undefined) await browser.tabs.reload(tab.id);
  }

  async function toggle(hosts: string[], on: boolean) {
    setEnabled(await setSites(hosts, on));
    setChanged(true);
  }

  async function addSite(event: FormEvent) {
    event.preventDefault();
    const host = parseHost(draft);
    setInvalid(host === null);
    if (host === null) return;
    await toggle([host], true);
    setDraft("");
  }

  const custom = (enabled ?? []).filter((host) => !DEFAULT_HOSTS.includes(host));

  return (
    <main className="mx-auto w-[22rem] p-4 text-sm">
      <header>
        <h1 className="font-heading text-base font-semibold">No More Ads</h1>
        <p className="text-muted-foreground">Choose where ads disappear.</p>
      </header>

      {failing && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          The extension couldn't reach its backend, so posts aren't being judged or counted. Reload
          the extension from your browser's extensions page, then refresh the tab.
        </p>
      )}

      {dodged !== null && (
        <Item variant="muted" size="sm" className="mt-3">
          <ItemContent>
            <ItemTitle>
              {dodged} {dodged === 1 ? "post" : "posts"} hidden
            </ItemTitle>
            <ItemDescription>Ads and AI slop. Roughly {timeSaved(dodged)} saved.</ItemDescription>
          </ItemContent>
        </Item>
      )}

      {isAuthenticated && hidden !== null && (
        <section className="mt-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Recently hidden</h2>
            <Button variant="outline" size="sm" onClick={() => void loadHidden()}>
              <HugeiconsIcon icon={RefreshIcon} aria-hidden />
              Refresh
            </Button>
          </div>
          {hidden.length === 0 ? (
            <p className="mt-2 text-muted-foreground">Nothing hidden yet.</p>
          ) : (
            <ItemGroup className="mt-2 max-h-40 overflow-y-auto">
              {hidden.map((post) => (
                <Item key={post.url} size="xs">
                  <ItemContent>
                    <ItemTitle>{REASONS[post.reason]}</ItemTitle>
                    <ItemDescription>
                      <a href={post.url} target="_blank" rel="noreferrer">
                        Open post
                      </a>
                    </ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          )}
        </section>
      )}

      <ItemGroup className="mt-3 gap-2">
        {DEFAULT_SITES.map((site) => (
          <SiteRow
            key={site.name}
            name={site.name}
            detail={site.hosts.join(", ")}
            icon={site.icon}
            checked={enabled?.includes(site.hosts[0]) ?? false}
            onChange={(on) => void toggle(site.hosts, on)}
          />
        ))}
        {custom.map((host) => (
          <SiteRow
            key={host}
            name={host}
            icon={Globe02Icon}
            checked
            onChange={() => void toggle([host], false)}
          />
        ))}
      </ItemGroup>

      <form onSubmit={(event) => void addSite(event)} className="mt-3 flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a site, e.g. example.com"
          aria-label="Site to add"
          aria-invalid={invalid}
        />
        <Button type="submit">
          <HugeiconsIcon icon={Add01Icon} aria-hidden />
          Add
        </Button>
      </form>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p role="status" className="min-h-4 text-xs text-muted-foreground">
          {invalid
            ? "That doesn't look like a website address."
            : changed && "Reload open tabs to apply the change."}
        </p>
        <Button variant="outline" size="sm" onClick={() => void reloadTab()}>
          Reload tab
        </Button>
      </div>

      <Separator className="mt-2" />
      <footer className="pt-2 text-xs text-muted-foreground">
        <Account />
      </footer>
    </main>
  );
}
