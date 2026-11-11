# Plan 008: It is known whether hiding a post also hides posts that quote or link to it

> **Executor instructions**: This is an **investigation** plan. Its output is
> a written finding, and a code change only if the evidence in Step 2 calls
> for one. Follow it step by step. If anything in the "STOP conditions"
> section occurs, stop and report — do not improvise. When done, update the
> status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git log --oneline -3 -- extension/entrypoints/x-network.content.ts`
> If it changed after the baseline commit, compare the "Current state"
> excerpt against the live code; on a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-first-commit-and-ci.md
- **Category**: bug (unconfirmed)
- **Planned at**: no commit, working tree of 2026-11-11

## Why this matters

On X, the extension hides a post by adding a CSS rule that hides any timeline
row containing a link to that post. A row that merely _quotes_ a hidden post,
or replies with a link to it, also contains such a link, so an ordinary post
may be hidden as collateral. This was reasoned from the code, not observed:
it depends on how X builds its page. This plan finds out, and fixes the rule
only if the problem is real.

## Current state

`extension/entrypoints/x-network.content.ts:14-21` today:

```ts
    const hidePosts = (hidden: Hidden[]) => {
      if (hidden.length === 0) return;
      for (const { id } of hidden) {
        // The rule exists before X renders the post, so it never paints.
        sheet.insertRule(
          `[data-testid="cellInnerDiv"]:has(a[href*="/status/${CSS.escape(id)}"]){display:none!important}`,
        );
      }
```

What is known about X's page (from the existing rules in `extension/rules.ts`):
each timeline row is `[data-testid="cellInnerDiv"]`, a post inside it is
`article[data-testid="tweet"]`, and post text is `[data-testid="tweetText"]`.

What is **not** known: which links a row contains for (a) its own post,
(b) a post it quotes, (c) a post it replies to. That is what Step 1 collects.

The script runs in the page's own JavaScript world, so the selector must be
plain CSS; it cannot call extension APIs.

## Commands you will need

`npm`/`npx` fail in this repo (pnpm is enforced).

| Purpose                 | Command            | Expected on success                                    |
| ----------------------- | ------------------ | ------------------------------------------------------ |
| Format, lint, typecheck | `vp check --fix`   | `pass: Found no warnings, lint errors, or type errors` |
| Tests                   | `vp test`          | all pass                                               |
| Extension build         | `vp run build:ext` | two `Built extension` lines                            |

## Scope

**In scope**:

- `plans/008-findings.md` (create — the written result)
- `extension/entrypoints/x-network.content.ts` — the selector string only,
  and only if Step 2 says so.

**Out of scope**:

- `extension/promoted.ts`, the background script, everything under `convex/`.
- Changing how posts are detected or judged.
- Logging in to X with anyone's credentials. See STOP conditions.

## Git workflow

- Branch: `advisor/008-hide-rule`
- One commit for the findings file; a second if the selector changes.
- Do NOT push.

## Steps

### Step 1: Collect evidence from a real X timeline

This needs a browser already signed in to X. If you are an automated executor
without one, STOP and hand this step to the human operator with the snippet
below.

On `https://x.com/home`, find a post that quotes another post. Open the
browser console and run:

```js
[...document.querySelectorAll('[data-testid="cellInnerDiv"]')].slice(0, 30).map((row) => ({
  statusLinks: [...row.querySelectorAll('a[href*="/status/"]')].map((a) => a.getAttribute("href")),
  hasQuote: row.querySelector('article [role="link"] [data-testid="tweetText"]') !== null,
}));
```

Record in `plans/008-findings.md`, with post ids replaced by `A`, `B`, …
(no usernames, no post text):

- For an ordinary row: the list of `statusLinks` shapes (e.g.
  `/<user>/status/A`, `/<user>/status/A/analytics`).
- For a row that quotes another post: whether the quoted post's id appears in
  any `href` in that row.
- For a reply row: whether the parent post's id appears in any `href`.

**Verify**: `plans/008-findings.md` exists and answers all three bullets with
"yes", "no" or "could not determine".

### Step 2: Decide

- If the quoted or parent post's id does **not** appear in any `href` of the
  quoting/reply row: the rule is safe. Write "No change needed" in the
  findings file and skip to Done criteria.
- If it **does** appear: go to Step 3.
- If you could not determine: write that, and STOP.

### Step 3: Narrow the selector (only if Step 2 requires it)

Using the link shapes recorded in Step 1, change the selector so it matches a
link that belongs to the row's own post and not to a quoted or parent post.
Pick whichever of these the evidence supports, and write which and why in the
findings file:

- match the own post's analytics link:
  `a[href$="/status/<id>/analytics"]`, if every own post has one and quoted
  posts do not;
- or match an exact ending, `a[href$="/status/<id>"]`, if the own post's
  timestamp link is always present and a quoted post's link is not an `<a>`.

Change only the template string. Keep `CSS.escape(id)` and
`display:none!important`.

**Verify**: `vp check --fix` passes; `vp test` passes;
`vp run build:ext` prints two `Built extension` lines.

## Test plan

No automated test: the behaviour depends on X's live page. If the selector
changes, the operator re-runs Step 1's observation with the rebuilt extension
and confirms a quoting post stays visible while the quoted ad is hidden.
Report whether that re-check was done.

## Done criteria

- [ ] `plans/008-findings.md` exists and states one of: "No change needed",
      "Selector narrowed to …", or "Could not determine"
- [ ] The findings file contains no usernames and no post text
- [ ] If the selector changed: `vp check`, `vp test`, `vp run build:ext` pass
- [ ] `git status --short` lists only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- No signed-in X session is available. Do not create an account or enter
  credentials; hand Step 1 to the operator.
- X's page no longer uses `data-testid="cellInnerDiv"` (the snippet returns an
  empty array on a loaded timeline). That is a larger breakage; report it.
- Neither candidate selector in Step 3 fits the evidence.

## Maintenance notes

- X changes its markup without notice. Whatever is decided here is a snapshot;
  the findings file records the date and what was observed.
- Posts that X itself marks as ads may have no timestamp link at all (they
  show "Ad" in its place). If Step 3 picks the exact-ending form, check an ad
  row specifically before relying on it.
