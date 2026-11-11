# Plan 009: The README describes this project and how to run it

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `head -1 README.md`
> If it does not print `# React + TypeScript + Vite`, someone already
> rewrote the README: STOP and report.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (best done last, so it describes the finished state)
- **Category**: docs
- **Planned at**: no commit, working tree of 2026-11-11

## Why this matters

`README.md` is the unmodified Vite starter template. Nothing in the repository
says what the project is, which settings the backend needs, how to load the
extension, or that a loaded extension must be reloaded after backend changes —
a gap that has already caused one confusing failure. After this plan, a new
contributor can get from clone to a working extension using the README alone.

## Current state

`README.md` begins `# React + TypeScript + Vite` and contains only template
text. `convex/README.md` is Convex's own template; leave it.

Everything below is verified fact about this repository. Use it as the
content; do not invent beyond it. Where a step says to check something, check
it and write what you find.

**What it is.** A browser extension (Chrome and Firefox, Manifest V3) that
hides ads on sites the user switches on, with a small React website and a
Convex backend. On X it also asks a model whether each post is an advert or
AI slop and hides those.

**Layout.**

- `src/` — the website (sign-in page).
- `extension/` — the extension: `entrypoints/popup` (settings UI),
  `entrypoints/ads.content.ts` (hides ads by CSS on enabled sites),
  `entrypoints/x-network.content.ts` (reads X's timeline responses),
  `entrypoints/background.ts` (calls the backend as the signed-in user),
  `rules.ts`, `sites.ts`, `promoted.ts`.
- `convex/` — backend: `auth.ts` (sign-in), `jev.ts` (judges posts through the
  Convex AI Gateway), `adRules.ts` (the questions and decision rules),
  `stats.ts` (count and record of hidden posts), `schema.ts`.
- `components/ui/`, `lib/` — shared shadcn/ui components, imported as
  `@@/components/ui/...`.
- `plans/` — implementation plans.

**Toolchain.** Vite+ (`vp`), pnpm, TypeScript, React, Tailwind CSS, WXT,
Convex. `npm` and `npx` do not work here (pnpm is enforced); use `vp`,
`pnpm exec`, `pnpm dlx`.

**Commands** (check each against `package.json` `scripts` before writing):

| Command           | What it does                                           |
| ----------------- | ------------------------------------------------------ |
| `vp install`      | install dependencies                                   |
| `pnpm dev`        | website dev server                                     |
| `pnpm dev:convex` | push backend changes to the dev deployment as you edit |
| `pnpm dev:ext`    | extension dev build into `.output/chrome-mv3-dev`      |
| `pnpm build:ext`  | production extension builds for Chrome and Firefox     |
| `vp check`        | format, lint and typecheck                             |
| `vp test`         | run tests                                              |

**Settings.** The client reads `VITE_CONVEX_URL` from `.env.local` (created by
`convex dev`; never committed). The Convex deployment needs these environment
variables — list the **names only**, never values:
`AUTH_PRIVATE_KEY`, `AUTH_JWKS`, `AUTH_GITHUB_CLIENT_ID`,
`AUTH_GITHUB_CLIENT_SECRET`, `AUTH_ALLOW_GUEST` (set to `true` to allow guest
sign-in), `AUTH_EXTENSION_ORIGINS` (comma-separated redirect origins for
GitHub sign-in from the extension). They are set with
`pnpm exec convex env set NAME=VALUE`. GitHub's OAuth callback path on the
deployment's site URL is `/oauth/github/callback`.

**Model access.** Judging uses the Convex AI Gateway, which requires a paid
Convex plan. Every judged post is billed.

**Loading the extension in Chrome.** Open `chrome://extensions`, turn on
Developer mode, choose "Load unpacked", and select `.output/chrome-mv3-dev`
(dev) or `.output/chrome-mv3` (production build). The `.output` folder is
hidden in macOS file pickers; press Cmd+Shift+G and paste the path. Then open
the popup, sign in (guest works when `AUTH_ALLOW_GUEST` is on), switch a site
on, and reload that site's tab.

**The reload gotcha.** After backend functions are renamed or the extension's
scripts change, click the reload arrow on the extension's card in
`chrome://extensions` and refresh open tabs. A stale copy keeps calling the
old backend and fails silently.

**What leaves the browser.** With X switched on and the user signed in, the
text of each post in the timeline is sent to the Convex backend and on to the
model. Signed out, nothing is sent.

**Known limits** (each is marked `shortcut:` in the code): X's ad label
fallback is English-only; Facebook selectors are unverified; long posts are
judged on their first 280 characters; only X hides are counted; GitHub sign-in
from the extension does not work in Safari.

## Commands you will need

| Purpose      | Command          | Expected on success                                    |
| ------------ | ---------------- | ------------------------------------------------------ |
| Format check | `vp check --fix` | `pass: Found no warnings, lint errors, or type errors` |

## Scope

**In scope**:

- `README.md` (rewrite)

**Out of scope**:

- `convex/README.md`, `CLAUDE.md`, `AGENTS.md`.
- Any source file. If a command in the table above does not match
  `package.json`, write what `package.json` says and note the discrepancy in
  your report; do not change `package.json`.
- Screenshots, badges, a licence section, a contributing guide.

## Git workflow

- Branch: `advisor/009-readme`
- One commit, e.g. `Rewrite README for this project`.
- Do NOT push.

## Steps

### Step 1: Verify the facts that can drift

Run `grep -n '"' package.json | sed -n 5,16p` and compare the scripts with the
commands table. Run `ls extension/entrypoints convex` and compare with the
layout list. If plans 002–008 have landed, list any new files they added
(for example `convex/verdicts.ts`, `extension/token.ts`) in the layout.

**Verify**: you have a corrected commands table and layout list.

### Step 2: Rewrite `README.md`

Replace the whole file. Sections, in this order: one-paragraph description;
"Getting started" (install, backend settings, run the backend, build and load
the extension); "Commands"; "Project layout"; "What leaves the browser";
"Known limits"; "Troubleshooting" (the reload gotcha). Plain language, short
sentences, no marketing. Under 150 lines.

**Verify**: `head -1 README.md` no longer prints `# React + TypeScript + Vite`;
`grep -c "Oxlint" README.md` prints `0`; `wc -l < README.md` prints a number
under 150.

### Step 3: Check for leaked values

**Verify**: `grep -nE "convex\.cloud|convex\.site|BEGIN|eyJ" README.md` returns
no matches (no deployment URLs, keys or tokens), and `vp check --fix` passes.

## Test plan

None. Documentation only.

## Done criteria

- [ ] `README.md` no longer contains the Vite template text
- [ ] All seven sections exist
- [ ] `grep -nE "convex\.cloud|convex\.site|BEGIN|eyJ" README.md` returns nothing
- [ ] `git status --short` lists only `README.md`
- [ ] `plans/README.md` status row updated

## STOP conditions

- The drift check fails (the README was already rewritten).
- A fact above contradicts the repository in a way you cannot resolve by
  reading `package.json` or listing directories.

## Maintenance notes

- Update "Project layout" and "Known limits" when files or shortcuts change.
- Never paste the contents of `.env.local` or any deployment URL into the
  README; name the variable instead.
