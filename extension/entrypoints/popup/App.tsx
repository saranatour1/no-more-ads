import { type FormEvent, useEffect, useState } from "react";
import { Add01Icon, Globe02Icon } from "@hugeicons/core-free-icons";
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
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { parseHost } from "../../rules";
import { DEFAULT_SITES, setSites, syncSites } from "../../sites";
import Account from "./Account.tsx";

const DEFAULT_HOSTS = DEFAULT_SITES.flatMap((site) => site.hosts);

// shortcut: a flat guess at the time one ad costs a reader, measure it if the figure starts to matter.
const SECONDS_PER_AD = 3;

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

  // Null while loading or signed out: the total is kept per account.
  const dodged = useQuery(api.stats.myDodged) ?? null;

  useEffect(() => {
    void syncSites().then(setEnabled);
  }, []);

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
      <p role="status" className="mt-2 min-h-4 text-xs text-muted-foreground">
        {invalid
          ? "That doesn't look like a website address."
          : changed && "Reload open tabs to apply the change."}
      </p>

      <Separator className="mt-2" />
      <footer className="pt-2 text-xs text-muted-foreground">
        <Account />
      </footer>
    </main>
  );
}
