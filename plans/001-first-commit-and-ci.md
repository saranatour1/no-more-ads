# Plan 001: The repository has a first commit and a CI workflow that runs the checks

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: this plan was written before any commit
> existed, so there is no SHA to diff against. Run `git log --oneline -1`.
> If it prints a commit, someone already made the first commit: skip Step 2
> and go to Step 3.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: no commit (the repository has none), working tree of 2026-11-11

## Why this matters

The project has a `.git` directory but zero commits. There is no history to
roll back to, no way to diff a change, and every other plan in `plans/` needs a
branch and a drift check. Nothing runs the checks automatically either: the
only gate is a person remembering to run `vp check` and `vp test`. After this
plan, there is one baseline commit and a workflow file that runs both on every
push and pull request.

## Current state

- `git rev-parse --short HEAD` fails with `fatal: Needed a single revision`.
- `.gitignore` already ignores `node_modules`, `dist`, `*.local`, `.env.*`,
  `.output`, `.wxt`.
- `.env.local` exists at the repo root and holds the Convex deployment
  settings. It must never be committed. It is matched by `*.local`.
- There is no `.github/` directory.
- Toolchain: Vite+ (`vp` CLI), pnpm, TypeScript, Convex. `package.json`
  declares pnpm in `devEngines`, so **`npm` and `npx` fail in this repo** with
  `EBADDEVENGINES`. Use `vp`, `pnpm exec` and `pnpm dlx` only.
- Vite+ documentation is installed locally at `node_modules/vite-plus/docs`.

## Commands you will need

| Purpose                 | Command      | Expected on success                                    |
| ----------------------- | ------------ | ------------------------------------------------------ |
| Install                 | `vp install` | exit 0                                                 |
| Format, lint, typecheck | `vp check`   | `pass: Found no warnings, lint errors, or type errors` |
| Tests                   | `vp test`    | `Test Files  3 passed`, `Tests  5 passed` (or more)    |

## Scope

**In scope**:

- Creating the first git commit of the existing tree.
- `.github/workflows/ci.yml` (create).

**Out of scope**:

- Any source file, except the formatter-only fix Step 2 allows. Do not fix
  or reorganise code in this plan.
- Adding a git remote, pushing, or creating a GitHub repository.
- `.env.local` — never stage it, never print its contents.

## Git workflow

- Step 2 commits directly to the default branch, because no branch can exist
  before the first commit.
- Step 3 goes on a branch `advisor/001-ci`, one commit.
- Commit message style: short imperative subject, e.g. `Add CI workflow`.
- Do NOT push.

## Steps

### Step 1: Confirm nothing sensitive would be committed

Run `git status --short | head -50` and `git check-ignore -v .env.local`.

**Verify**: `git check-ignore -v .env.local` prints a line naming `.gitignore`.
`git status --short` lists no path beginning with `.env`, `node_modules`,
`.output`, `.wxt` or `dist`.

### Step 2: Make the baseline commit

Run `vp check` and `vp test` first. When this plan was written, `vp check`
reported one formatting-only issue, in `convex/adRules.ts`. If `vp check`
fails with **only** "Formatting issues found", run `vp check --fix` once and
re-run `vp check`; a formatting-only change to that file is allowed in the
baseline commit. Any lint, type or test failure is a STOP condition. Then:

```
git add -A
git status --short | grep -E "^A  \.env" && echo "STOP: env file staged"
git commit -m "Initial commit: website, browser extension and Convex backend"
```

**Verify**: `git log --oneline | wc -l` prints `1`, and
`git ls-files | grep -c "^\.env"` prints `0`.

### Step 3: Add the CI workflow

Read the CI guidance in `node_modules/vite-plus/docs` first
(`grep -ril "github actions\|setup-vp\|ci" node_modules/vite-plus/docs | head`).
Use the setup action and install command those docs name. Create
`.github/workflows/ci.yml` with one job that, on `push` and `pull_request`:

1. checks out the repo,
2. installs Vite+ the way the docs describe,
3. runs `vp install`,
4. runs `vp check`,
5. runs `vp test`.

Do not add a Convex deploy step, an extension build step, secrets, or caching
beyond what the documented setup action does by default.

**Verify**: `test -f .github/workflows/ci.yml && grep -c "vp check" .github/workflows/ci.yml`
prints `1`, and `grep -c "vp test" .github/workflows/ci.yml` prints `1`.

## Test plan

No new tests. The workflow is verified for real only once the repository is
pushed to GitHub, which is out of scope; say so in your report.

## Done criteria

- [ ] `git log --oneline | wc -l` prints at least `1`
- [ ] `git ls-files | grep -c "^\.env"` prints `0`
- [ ] `.github/workflows/ci.yml` exists and runs `vp install`, `vp check`, `vp test`
- [ ] `vp check` and `vp test` still pass
- [ ] `plans/README.md` status row updated

## STOP conditions

- `git check-ignore -v .env.local` prints nothing (the env file is not ignored).
- `vp check` still fails after one `vp check --fix`, or reports anything other
  than formatting, or `vp test` fails. Report the output; do not fix code
  under this plan.
- The Vite+ docs contain no CI guidance. Report that instead of guessing an
  action name.

## Maintenance notes

- The workflow has never run. The first push to GitHub is its real test.
- CI does not push Convex functions or build the extension. If either breaks
  silently in future, add `vp run build:ext` as a later step.
- Every other plan's drift check assumes the commit made in Step 2 exists.
