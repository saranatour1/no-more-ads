# Plan 002: Only X pages can ask the extension to judge posts

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git log --oneline -3 -- extension/entrypoints/ads.content.ts extension/rules.ts`
> If either file changed after the baseline commit, compare the "Current
> state" excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-first-commit-and-ci.md (for a branch to work on)
- **Category**: security
- **Planned at**: no commit, working tree of 2026-11-11

## Why this matters

The extension judges posts with a paid model, billed to the project owner.
Posts reach the extension as page events named `nma-posts`. The listener for
that event is attached on **every site the user has switched on**, not only on
X. Any page on an enabled site can therefore dispatch the same event with text
of its choosing and have it judged at the owner's cost, and can dispatch
`nma-hidden` to write made-up entries into the user's record of hidden posts.
After this plan, the listeners exist only on X, and what they forward is
bounded.

## Current state

- `extension/entrypoints/ads.content.ts` — content script injected into every
  enabled site. It hides ads by CSS and relays events to the background script.
- `extension/entrypoints/x-network.content.ts` — runs in the page's own
  JavaScript world on X only; it dispatches `nma-posts` and `nma-hidden`, and
  listens for `nma-verdicts`. It cannot message the extension directly, which
  is why the relay exists.
- `extension/rules.ts` — per-site rules. X is matched by a regex.

`extension/entrypoints/ads.content.ts:9-31` today:

```ts
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
```

`extension/rules.ts` has this entry at the top of the `SITES` array:

```ts
  [
    /(^|\.)(x|twitter)\.com$/,
    {
      labelled: {
```

Conventions to match:

- Comments explain _why_, one line, no restating the code.
- Tests use `import { expect, test } from "vite-plus/test";` — see
  `extension/rules.test.ts`.
- A deliberate limit is marked `// shortcut: <the limit>, <when to upgrade>`.

## Commands you will need

`npm`/`npx` fail in this repo (pnpm is enforced). Use these:

| Purpose                 | Command            | Expected on success                                    |
| ----------------------- | ------------------ | ------------------------------------------------------ |
| Format, lint, typecheck | `vp check --fix`   | `pass: Found no warnings, lint errors, or type errors` |
| Tests                   | `vp test`          | all pass                                               |
| Extension build         | `vp run build:ext` | two lines containing `Built extension`                 |

## Scope

**In scope**:

- `extension/rules.ts`
- `extension/rules.test.ts`
- `extension/entrypoints/ads.content.ts`

**Out of scope**:

- `extension/entrypoints/x-network.content.ts` — the event names and payloads
  stay exactly as they are.
- `extension/entrypoints/background.ts` and everything under `convex/`.
- Authenticating the events (a shared secret between the two scripts). The
  page can read anything the page-world script holds, so it would not help.

## Git workflow

- Branch: `advisor/002-relay-only-on-x`
- One commit, e.g. `Relay post events only on X`.
- Do NOT push.

## Steps

### Step 1: Export one definition of "is this X"

In `extension/rules.ts`, add above `SITES`:

```ts
const X_HOST = /(^|\.)(x|twitter)\.com$/;

/** True on X, the only site whose posts are judged. */
export const isX = (hostname: string) => X_HOST.test(hostname);
```

and replace the inline regex in the first `SITES` entry with `X_HOST`.

**Verify**: `vp check --fix` passes; `grep -c "(x|twitter)" extension/rules.ts` prints `1`.

### Step 2: Guard and bound the relay

In `extension/entrypoints/ads.content.ts`:

1. Import `isX` alongside `rulesFor`.
2. Wrap the two `document.addEventListener(...)` calls in
   `if (isX(location.hostname)) { ... }`.
3. Inside the `nma-posts` handler, forward at most 200 posts, and only objects
   with a string `id` and string `text`. Drop anything else silently.
4. Inside the `nma-hidden` handler, forward at most 200 entries.
5. Add `.catch(() => {})` to both `sendMessage` promises, with a one-line
   comment: the background can be asleep or the extension reloaded, and that
   must not throw inside the page.

Leave everything from `if (labelled === undefined) return;` downward untouched.

**Verify**: `vp check --fix` passes.

### Step 3: Test `isX`

Add one test to `extension/rules.test.ts`:

```ts
test("isX matches X and Twitter hosts only", () => {
  expect(isX("x.com")).toBe(true);
  expect(isX("mobile.twitter.com")).toBe(true);
  expect(isX("notx.com")).toBe(false);
  expect(isX("x.com.evil.example")).toBe(false);
});
```

**Verify**: `vp test` → all pass, one more test than before.

### Step 4: Build

**Verify**: `vp run build:ext` prints two `Built extension` lines and no `error`.

## Test plan

- New: the `isX` test above.
- The listener guard itself is not unit-tested (it needs a browser). State
  that in your report.

## Done criteria

- [ ] `vp check` passes
- [ ] `vp test` passes, including the new `isX` test
- [ ] `vp run build:ext` succeeds
- [ ] `grep -n "nma-posts" extension/entrypoints/ads.content.ts` shows the listener inside an `isX` guard
- [ ] `git status --short` lists only the three in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts in "Current state" don't match the live files.
- A verification fails twice after a reasonable fix attempt.
- The fix seems to need a change in `x-network.content.ts` or `background.ts`.

## Maintenance notes

- X's own page can still dispatch these events; that is accepted, because X
  already controls everything on its page. The server-side limits (plan 003)
  are the real ceiling on spend.
- If judging is ever extended to another site, extend `isX` into a general
  "judged sites" check rather than adding a second guard.
- Reviewer: confirm the CSS-hiding path (the `style` element and the
  `labelled` sweep) is byte-for-byte unchanged.
