# Plan 004: The background script refreshes an expired sign-in up front and never retries a failed call

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git log --oneline -3 -- extension/entrypoints/background.ts`
> If it changed after the baseline commit, compare the "Current state"
> excerpt against the live code; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-first-commit-and-ci.md
- **Category**: bug
- **Planned at**: no commit, working tree of 2026-11-11

## Why this matters

The extension's background script calls the backend as the signed-in user. To
cope with an expired access token it retries **any** failed call once with a
forced token refresh. That is wrong for every failure that is not an expired
token: a model outage or a rate-limit error is retried in full, which can
judge up to 200 posts twice (each one billed), and every such failure rotates
the user's refresh token for nothing. After this plan, the script checks the
token's expiry before calling, refreshes only when needed, and makes each call
once.

## Current state

- `extension/entrypoints/background.ts` — the only file that calls the backend
  from the background.
- `extension/promoted.ts` and `extension/promoted.test.ts` — exemplar of a pure
  helper with a test.

`extension/entrypoints/background.ts:30-40` today:

```ts
  await auth.init();
  const attempt = async (forceRefreshToken: boolean) => {
    const token = await auth.fetchAccessToken({ forceRefreshToken });
    if (token === null) return signedOut;
    const convex = new ConvexHttpClient(url);
    convex.setAuth(token);
    return await call(convex);
  };
  // The stored access token may have expired; retry once with a fresh one.
  return await attempt(false).catch(() => attempt(true));
}
```

Facts about the pieces involved:

- `auth` is an `AuthClient` from `@convex-dev/auth/browser`.
  `fetchAccessToken({ forceRefreshToken: false })` returns the stored token
  without checking expiry; with `true` it refreshes and returns the new token,
  or `null` if the session is gone.
- The access token is a standard JWT: three base64url parts separated by dots;
  the middle part is JSON with an `exp` field in seconds since the epoch.
- Background scripts have `atob` available.

Conventions: comments say _why_ in one line; tests import from
`vite-plus/test`; no new dependencies for a few lines of code.

## Commands you will need

`npm`/`npx` fail in this repo (pnpm is enforced).

| Purpose                 | Command            | Expected on success                                    |
| ----------------------- | ------------------ | ------------------------------------------------------ |
| Format, lint, typecheck | `vp check --fix`   | `pass: Found no warnings, lint errors, or type errors` |
| Tests                   | `vp test`          | all pass                                               |
| Extension build         | `vp run build:ext` | two `Built extension` lines                            |

## Scope

**In scope**:

- `extension/token.ts` (create)
- `extension/token.test.ts` (create)
- `extension/entrypoints/background.ts`

**Out of scope**:

- `extension/authStorage.ts`, the popup, the content scripts.
- Anything under `convex/`.
- Verifying the JWT signature. The server does that; this is only a clock check.

## Git workflow

- Branch: `advisor/004-refresh-token-by-expiry`
- One commit, e.g. `Refresh the access token by expiry, not by retry`.
- Do NOT push.

## Steps

### Step 1: Add a pure expiry check

Create `extension/token.ts` exporting:

```ts
/**
 * True when the JWT is expired or will be within `marginSeconds`. A token
 * that cannot be read counts as expired, so the caller refreshes it.
 */
export function isExpired(token: string, nowSeconds: number, marginSeconds = 60): boolean;
```

Implementation: take `token.split(".")[1]`, convert base64url to base64
(`-`→`+`, `_`→`/`), `atob`, `JSON.parse`, read `exp`. Return `true` if anything
throws or `exp` is not a number; otherwise `exp - marginSeconds <= nowSeconds`.

**Verify**: `vp check --fix` passes.

### Step 2: Test it

Create `extension/token.test.ts` with one test covering: a token whose `exp`
is far in the future (false), one in the past (true), one 30 seconds ahead
with the default margin (true), and the string `"garbage"` (true). Build test
tokens with a small local helper that base64url-encodes `{"exp": n}` between
two placeholder parts, e.g. `` `x.${payload}.y` ``.

**Verify**: `vp test` → all pass, one more test file than before.

### Step 3: Use it in the background script

In `extension/entrypoints/background.ts`, replace the `attempt` function and
the retry line with a single pass:

1. `let token = await auth.fetchAccessToken({ forceRefreshToken: false });`
2. If `token !== null && isExpired(token, Date.now() / 1000)`, set
   `token = await auth.fetchAccessToken({ forceRefreshToken: true });`
3. If `token === null`, return `signedOut`.
4. Build the client, `setAuth(token)`, `return await call(convex);`

Replace the old comment with one line saying a failed call is not retried
because a retry would judge, and bill, the same posts twice.

**Verify**: `grep -c "catch(() => attempt" extension/entrypoints/background.ts`
prints `0`; `vp check --fix` passes.

### Step 4: Build

**Verify**: `vp run build:ext` prints two `Built extension` lines, no `error`.

## Test plan

- New: `extension/token.test.ts` as described.
- The background flow itself needs a browser and is not unit-tested; say so in
  the report.

## Done criteria

- [ ] `vp check` passes
- [ ] `vp test` passes, including `extension/token.test.ts`
- [ ] `vp run build:ext` succeeds
- [ ] `grep -c "attempt(true)" extension/entrypoints/background.ts` prints `0`
- [ ] `git status --short` lists only the three in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpt in "Current state" doesn't match the live file.
- `fetchAccessToken` has a different signature than described (check
  `node_modules/@convex-dev/auth/dist/browser/sessionManager.d.ts`).
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- If the device clock is badly wrong, a valid token can look expired (one
  extra refresh, harmless) or an expired one can look valid (the call fails
  once and the next one refreshes). Both are acceptable.
- Plan 005 changes the same file's error handler; land them in order or rebase.
- Reviewer: confirm there is exactly one `call(convex)` invocation per message.
