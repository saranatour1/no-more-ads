import { useState } from "react";
import { track } from "@databuddy/sdk";
import {
  Facebook01Icon,
  GoogleIcon,
  Linkedin01Icon,
  NewTwitterIcon,
  RedditIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@@/components/ui/button";
import { Item, ItemContent, ItemGroup, ItemTitle } from "@@/components/ui/item";
import { Separator } from "@@/components/ui/separator";
import SiteRow from "@@/extension/SiteRow";

const REPO = "https://github.com/saranatour1/no-more-ads";
// ponytail: no store listings yet, so both point at the repo. Swap in the store URLs once published.
const STORES = { Chrome: REPO, Firefox: REPO };

// Edge, Brave and Arc install from the Chrome store, so anything that isn't Firefox gets Chrome.
const isFirefox = /Firefox|FxiOS/.test(navigator.userAgent);
const isSafari =
  !isFirefox && /Safari/.test(navigator.userAgent) && !/Chrom|CriOS|Edg/.test(navigator.userAgent);
const browserName = isFirefox ? "Firefox" : "Chrome";
const otherName = isFirefox ? "Chrome" : "Firefox";

const SITES = [
  { name: "X", host: "x.com", icon: NewTwitterIcon },
  { name: "Facebook", host: "facebook.com", icon: Facebook01Icon },
  { name: "Reddit", host: "reddit.com", icon: RedditIcon },
  { name: "LinkedIn", host: "linkedin.com", icon: Linkedin01Icon },
  { name: "Google", host: "google.com", icon: GoogleIcon },
];

const HIDDEN = ["Labeled ad", "AI slop", "Unlabeled ad", "Blocked word or site"];

function PopupPreview() {
  const [on, setOn] = useState<Record<string, boolean>>({ X: true, Facebook: true, Reddit: true });
  return (
    <div className="mx-auto flex w-80 shrink-0 flex-col gap-3 rounded-2xl border p-4">
      <div className="flex items-baseline justify-between">
        <span className="font-semibold">No More Ads</span>
        <span className="text-xs text-muted-foreground">
          <span className="font-medium text-brand tabular-nums">128</span> hidden, about 6 min saved
        </span>
      </div>
      <ItemGroup className="gap-2">
        {SITES.map((site) => (
          <SiteRow
            key={site.name}
            name={site.name}
            detail={site.host}
            icon={site.icon}
            checked={on[site.name] ?? false}
            onChange={(checked) => setOn({ ...on, [site.name]: checked })}
          />
        ))}
      </ItemGroup>
      <Separator />
      <div className="flex justify-between">
        <Button variant="outline" size="sm">
          Settings
        </Button>
        <Button variant="outline" size="sm">
          Reload tab
        </Button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-8">
        <span className="text-lg font-semibold">No More Ads</span>
        <Button variant="outline" size="sm" asChild>
          <a
            href={STORES[browserName]}
            onClick={() => track("install_clicked", { browser: browserName, placement: "header" })}
          >
            Add to {browserName}
          </a>
        </Button>
      </header>

      <main>
        <section className="mx-auto flex max-w-5xl flex-wrap items-center gap-16 px-6 pt-16 pb-20">
          <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-5">
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight">
              I don't have the capacity to keep looking at AI-generated slop or promoted nonsense.
            </h1>
            <p className="max-w-lg text-lg">
              So I built something to remove them, with{" "}
              <a href="https://convex.dev" className="underline underline-offset-4">
                Convex
              </a>
              .
            </p>
            <p className="max-w-lg text-muted-foreground">
              It works on X, Facebook, Reddit, LinkedIn and Google, and only on the sites you turn
              on.
            </p>
            <div className="flex flex-col items-start gap-3 pt-4">
              <Button variant="brand" size="lg" asChild>
                <a
                  href={STORES[browserName]}
                  onClick={() =>
                    track("install_clicked", { browser: browserName, placement: "hero" })
                  }
                >
                  Add to {browserName}
                </a>
              </Button>
              {isSafari && (
                <p className="text-xs text-muted-foreground">Not available for Safari yet.</p>
              )}
              <p className="text-xs text-muted-foreground">
                Using {otherName}?{" "}
                <a
                  href={STORES[otherName]}
                  onClick={() =>
                    track("install_clicked", { browser: otherName, placement: "other_browser" })
                  }
                  className="underline underline-offset-4"
                >
                  Get it here
                </a>
              </p>
            </div>
          </div>
          <PopupPreview />
        </section>

        <section className="border-t">
          <div className="mx-auto flex max-w-5xl flex-wrap items-start gap-16 px-6 pt-12 pb-14">
            <div className="flex max-w-xl min-w-0 flex-[1_1_440px] flex-col gap-3">
              <h2 className="font-medium">What gets hidden</h2>
              <ul className="flex list-disc flex-col gap-1.5 pl-5">
                <li>
                  <span className="font-medium">Labeled ads.</span>{" "}
                  <span className="text-muted-foreground">
                    The ones that say "Promoted" in small grey text.
                  </span>
                </li>
                <li>
                  <span className="font-medium">Unlabeled ads.</span>{" "}
                  <span className="text-muted-foreground">
                    The ones pretending to be a normal post.
                  </span>
                </li>
                <li>
                  <span className="font-medium">AI slop.</span>{" "}
                  <span className="text-muted-foreground">You know it when you see it.</span>
                </li>
                <li>
                  <span className="font-medium">Anything you block.</span>{" "}
                  <span className="text-muted-foreground">
                    Add a word or a site and those posts go too.
                  </span>
                </li>
              </ul>
              <p className="text-muted-foreground">
                If it hides something it shouldn't, it's still there under Recently hidden in
                settings, one click away.
              </p>
            </div>
            <div className="mx-auto flex w-80 shrink-0 flex-col gap-2 rounded-2xl border p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">Recently hidden</span>
                <Button variant="outline" size="sm">
                  Refresh
                </Button>
              </div>
              <ItemGroup className="gap-2">
                {HIDDEN.map((reason) => (
                  <Item key={reason} variant="outline" size="xs" className="justify-between">
                    <ItemContent>
                      <ItemTitle>{reason}</ItemTitle>
                    </ItemContent>
                    <span className="text-xs text-muted-foreground underline underline-offset-4">
                      Open post
                    </span>
                  </Item>
                ))}
              </ItemGroup>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-3 px-6 py-6 text-xs text-muted-foreground">
          <span>
            Works in Chrome and Firefox. Built with love on{" "}
            <a href="https://convex.dev" className="underline underline-offset-4">
              Convex
            </a>
            .
          </span>
          <a href={REPO} className="underline underline-offset-4">
            Source on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
