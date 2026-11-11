# Plan 005: The popup tells the user when the backend is rejecting the extension's calls

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git log --oneline -3 -- extension/entrypoints/background.ts extension/entrypoints/popup/App.tsx`
> If either changed after the baseline commit (other than by plan 004),
> compare the "Current state" excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/004-refresh-token-by-expiry.md (same file; land 004 first)
- **Category**: dx
- **Planned at**: no commit, working tree of 2026-11-11

## Why this matters

When a backend call from the extension fails, the only trace is a
`console.error` in the background script's console, which nobody has open.
This already cost a debugging session: a stale copy of the extension kept
calling a backend function that had been renamed, every count was rejected,
and the visible symptom was only "the counter seems broken". After this plan,
the popup shows a one-line notice when the most recent backend call failed,
and clears it when calls succeed again.

## Current state

- `extension/entrypoints/background.ts` — makes the backend calls.
- `extension/entrypoints/popup/App.tsx` — the popup UI.
- `extension/authStorage.ts` — exemplar of using `browser.storage.local`.

`extension/entrypoints/background.ts:44-60` today:

```ts
export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: Message, _sender, respond) => {
    const work =
      "posts" in message
        ? // Which of these posts are adverts or AI slop?
          asUser((convex) => convex.action(api.jev.judgePosts, { posts: message.posts }), [])
        : // Record the posts just hidden, and add them to the user's total.
          asUser(
            (convex) => convex.mutation(api.stats.recordHidden, { posts: message.hidden }),
            null,
          );
    work.then(respond, (error) => {
      console.error("[no-more-ads] backend call failed:", error);
      respond("posts" in message ? [] : null);
    });
    return true; // The answer is sent asynchronously.
  });
});
```

In `extension/entrypoints/popup/App.tsx`, the component has a status line near
the bottom:

```tsx
<p role="status" className="mt-2 min-h-4 text-xs text-muted-foreground">
  {invalid
    ? "That doesn't look like a website address."
    : changed && "Reload open tabs to apply the change."}
</p>
```

and loads its initial state in one effect:

```tsx
useEffect(() => {
  void syncSites().then(setEnabled);
}, []);
```

Conventions:

- The popup uses stock shadcn components from `@@/components/ui/*` with no
  custom colours. Use the existing theme class `text-destructive` for errors;
  it is already used in `extension/entrypoints/popup/Account.tsx`.
- UI text is plain and addressed to a non-technical user.
- `browser` comes from `wxt/browser`.

## Commands you will need

`npm`/`npx` fail in this repo (pnpm is enforced).

| Purpose                 | Command            | Expected on success                                    |
| ----------------------- | ------------------ | ------------------------------------------------------ |
| Format, lint, typecheck | `vp check --fix`   | `pass: Found no warnings, lint errors, or type errors` |
| Tests                   | `vp test`          | all pass                                               |
| Extension build         | `vp run build:ext` | two `Built extension` lines                            |

## Scope

**In scope**:

- `extension/entrypoints/background.ts`
- `extension/entrypoints/popup/App.tsx`

**Out of scope**:

- `extension/authStorage.ts` — do not change how sign-in tokens are stored.
- The content scripts and everything under `convex/`.
- Retrying failed calls, or queueing counts for later. Only report.
- New shadcn components or new colours.

## Git workflow

- Branch: `advisor/005-show-backend-failures`
- One commit, e.g. `Show backend failures in the popup`.
- Do NOT push.

## Steps

### Step 1: Record the outcome of each backend call

In `extension/entrypoints/background.ts`, add a module-level constant
`const FAILURE_KEY = "backendFailure";` and export nothing new. In the message
listener:

- On success: `void browser.storage.local.remove(FAILURE_KEY);` then respond
  as today.
- On failure: keep the `console.error`, and also
  `void browser.storage.local.set({ [FAILURE_KEY]: Date.now() });` then respond
  as today.

Store only the timestamp. Do not store the error message: it can contain post
text.

**Verify**: `vp check --fix` passes.

### Step 2: Show it in the popup

In `extension/entrypoints/popup/App.tsx`:

1. Add state `const [failing, setFailing] = useState(false);`.
2. In the existing effect, also read the key:
   `void browser.storage.local.get("backendFailure").then((items) => setFailing(items.backendFailure !== undefined));`
   Import `browser` from `wxt/browser`.
3. Directly under the `<header>` element, render when `failing` is true:

```tsx
<p role="alert" className="mt-3 text-xs text-destructive">
  The extension couldn't reach its backend, so posts aren't being judged or counted. Reload the
  extension from your browser's extensions page, then refresh the tab.
</p>
```

**Verify**: `vp check --fix` passes; `grep -c "backendFailure" extension/entrypoints/popup/App.tsx`
prints at least `1`.

### Step 3: Build

**Verify**: `vp run build:ext` prints two `Built extension` lines, no `error`.

## Test plan

No unit test: both halves need the browser's extension APIs. Manual check for
the operator, to be listed in your report as **not performed** unless you can
do it: load the extension, sign in, stop the network, scroll X, open the popup
and see the notice; restore the network, scroll, reopen, notice gone.

## Done criteria

- [ ] `vp check` and `vp test` pass
- [ ] `vp run build:ext` succeeds
- [ ] `grep -c "FAILURE_KEY" extension/entrypoints/background.ts` prints at least `3`
- [ ] `git status --short` lists only the two in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts in "Current state" don't match the live files and plan 004 does
  not explain the difference.
- The change seems to need a new permission in `wxt.config.ts` (`storage` is
  already granted; anything else is out of scope).

## Maintenance notes

- A signed-out user never triggers the notice, because signed-out calls are
  skipped, not failed.
- The notice is cleared only by a later successful call, so it can linger
  after the cause is fixed until the user scrolls X again. Acceptable.
- Reviewer: confirm no error text or post content is written to storage.
