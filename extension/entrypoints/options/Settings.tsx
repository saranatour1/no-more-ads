import { type FormEvent, useEffect, useState } from "react";
import { Add01Icon, Globe02Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@@/components/ui/button";
import { Input } from "@@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@@/components/ui/item";
import { Separator } from "@@/components/ui/separator";
import { useConvex, useConvexAuth, useQuery } from "convex/react";
import { type FunctionReturnType } from "convex/server";
import { browser } from "wxt/browser";
import { api } from "../../../convex/_generated/api";
import { parseHost } from "../../rules";
import SiteRow from "../../SiteRow.tsx";
import { DEFAULT_SITES, setSites, syncSites } from "../../sites";
import Account from "./Account.tsx";

const DEFAULT_HOSTS = DEFAULT_SITES.flatMap((site) => site.hosts);

const REASONS = {
  promoted: "Ad, marked by X",
  ad: "Advert",
  slop: "AI slop",
  blocked: "Blocked word or site",
};

export default function Settings() {
  // Hosts the user has granted access to; null while loading.
  const [enabled, setEnabled] = useState<string[] | null>(null);
  const [changed, setChanged] = useState(false);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);

  // One-shot query, not useQuery: a live subscription would make Refresh a no-op.
  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const [hidden, setHidden] = useState<FunctionReturnType<typeof api.stats.myHidden>>(null);
  async function loadHidden() {
    setHidden(await convex.query(api.stats.myHidden, {}));
  }

  useEffect(() => {
    void syncSites().then(setEnabled);
  }, []);

  // Auth is restored asynchronously, so load once the client is signed in.
  useEffect(() => {
    if (isAuthenticated) void convex.query(api.stats.myHidden, {}).then(setHidden);
  }, [convex, isAuthenticated]);

  async function reload() {
    // Re-register scripts first so the reloaded page gets the current ones.
    await syncSites();
    // Restarts the whole extension: the browser keeps running the old
    // background script until this happens, whatever is on disk. The
    // restarted background then reloads the tab (see background.ts).
    browser.runtime.reload();
  }

  // Null while loading or signed out: the list is kept per account.
  const blocked = useQuery(api.blocked.list) ?? null;
  const [blockDraft, setBlockDraft] = useState("");
  // The page scripts can't query the backend, so they read this copy.
  // shortcut: other devices get the list only once this page is opened there, sync from the background if that matters.
  useEffect(() => {
    if (blocked !== null) void browser.storage.local.set({ blockedTerms: blocked });
  }, [blocked]);

  async function block(event: FormEvent) {
    event.preventDefault();
    if (blockDraft.trim().length < 2) return;
    await convex.mutation(api.blocked.add, { term: blockDraft });
    setBlockDraft("");
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
    <main className="mx-auto max-w-md p-6 text-sm">
      <header>
        <h1 className="font-heading text-lg font-semibold">No More Ads settings</h1>
        <p className="text-muted-foreground">Choose where ads disappear, and what else to hide.</p>
      </header>

      <h2 className="mt-5 font-medium">Sites</h2>

      <ItemGroup className="mt-2 gap-2">
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
        <Button variant="outline" size="sm" onClick={() => void reload()}>
          Reload
        </Button>
      </div>

      {blocked !== null && (
        <section className="mt-5">
          <h2 className="font-medium">Blocked words and sites</h2>
          <p className="text-xs text-muted-foreground">
            Posts on X that mention one of these are hidden.
          </p>
          <form onSubmit={(event) => void block(event)} className="mt-2 flex gap-2">
            <Input
              value={blockDraft}
              onChange={(event) => setBlockDraft(event.target.value)}
              placeholder="A word or site, e.g. crypto"
              aria-label="Word or site to block"
              maxLength={100}
            />
            <Button type="submit" variant="outline">
              Block
            </Button>
          </form>
          {blocked.length > 0 && (
            <ItemGroup className="mt-2">
              {blocked.map((term) => (
                <Item key={term} size="xs">
                  <ItemContent>
                    <ItemTitle>{term}</ItemTitle>
                  </ItemContent>
                  <ItemActions>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => void convex.mutation(api.blocked.remove, { term })}
                    >
                      Remove
                    </Button>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
        </section>
      )}

      {isAuthenticated && hidden !== null && (
        <section className="mt-5">
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
            <ItemGroup className="mt-2">
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

      <Separator className="mt-5" />
      <footer className="pt-2 text-xs text-muted-foreground">
        <Account />
      </footer>
    </main>
  );
}
