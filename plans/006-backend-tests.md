# Plan 006: The backend's sign-in checks and count-once rule are covered by automated tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git log --oneline -3 -- convex/stats.ts convex/jev.ts convex/schema.ts`
> If any changed after the baseline commit (other than by plan 003), compare
> the "Current state" excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (adds test files and dev dependencies only)
- **Depends on**: plans/001-first-commit-and-ci.md
- **Category**: tests
- **Planned at**: no commit, working tree of 2026-11-11

## Why this matters

The backend functions that guard money and data — who may judge posts, who may
record hidden posts, and the rule that a post is counted once — are verified
only by hand from the command line. The existing tests cover pure helpers
only. Plan 007 rewrites the judging path; without tests around the current
behaviour it would be changed blind. After this plan, `vp test` exercises
these functions against an in-memory Convex backend.

## Current state

- `convex/stats.ts` — `recordHidden` (mutation) and `myDodged` (query).
- `convex/jev.ts` — `judgePosts` (action; calls a paid external model).
- `convex/schema.ts` — tables `hidden` and `users`.
- `convex/convex.config.ts` — mounts components, including
  `@convex-dev/sharded-counter` under the name `shardedCounter`.
- `convex/adRules.test.ts` — exemplar test file.
- `convex/_generated/ai/guidelines.md` — **read the "Testing guidelines"
  section first**. It says: test with `convex-test`, Vitest and
  `@edge-runtime/vm`; environment `edge-runtime`; test files live under
  `convex/`; pass `import.meta.glob("./**/*.ts")` as the module map; add
  `/// <reference types="vite/client" />` only in files using `import.meta.glob`.

Behaviour to pin down (`convex/stats.ts`, abridged):

```ts
export const recordHidden = mutation({
  args: {
    posts: v.array(
      v.object({
        id: v.string(),
        reason: v.union(v.literal("promoted"), v.literal("ad"), v.literal("slop")),
      }),
    ),
  },
  handler: async (ctx, { posts }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    if (posts.length > 200) throw new Error("Too many posts");
    let added = 0;
    for (const { id, reason } of posts) {
      if (!/^\d{1,25}$/.test(id)) throw new Error("Bad post id");
      const url = `https://x.com/i/status/${id}`;
      const seen = await ctx.db
        .query("hidden")
        .withIndex("by_userId_and_url", (q) => q.eq("userId", userId).eq("url", url))
        .first();
      if (seen !== null) continue;
      await ctx.db.insert("hidden", { userId, url, reason });
      added++;
    }
    if (added > 0) await dodged.add(ctx, userId, added);
    return null;
  },
});

export const myDodged = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    return userId === null ? null : await dodged.count(ctx, userId);
  },
});
```

`convex/jev.ts` `judgePosts` throws `Not signed in` when there is no user and
`Too many posts` when given more than 200, both **before** any network call.

Facts you need:

- `getAuthUserId` returns the `subject` of the caller's identity. In tests,
  `t.withIdentity({ subject: <a users document id> })` is therefore enough to
  act as a signed-in user. No auth component setup is needed.
- The sharded counter ships a test helper: `@convex-dev/sharded-counter/test`
  default-exports `{ register, schema, modules }`; `register(t, "shardedCounter")`
  registers it on a `convexTest` instance (see
  `node_modules/@convex-dev/sharded-counter/src/test.ts`).
- Tests in this repo import from `vite-plus/test`, not `vitest`:
  `import { expect, test } from "vite-plus/test";`

## Commands you will need

`npm`/`npx` fail in this repo (pnpm is enforced).

| Purpose                 | Command                                  | Expected on success                                    |
| ----------------------- | ---------------------------------------- | ------------------------------------------------------ |
| Add dev dependencies    | `vp add -D convex-test @edge-runtime/vm` | exit 0                                                 |
| Format, lint, typecheck | `vp check --fix`                         | `pass: Found no warnings, lint errors, or type errors` |
| Tests                   | `vp test`                                | all pass                                               |

## Scope

**In scope**:

- `package.json`, `pnpm-lock.yaml` (via `vp add -D`)
- `convex/stats.test.ts` (create)
- `convex/jev.test.ts` (create)
- `vite.config.ts` — only if the per-file environment comment in Step 2 does
  not work, and then only to add a `test` section.

**Out of scope**:

- Any non-test file under `convex/`. If a test reveals a bug, report it; do
  not fix it here.
- Tests that reach the real model. Never let a test call `fetch` to the AI
  Gateway.
- Tests for the browser extension's scripts (they need browser APIs).

## Git workflow

- Branch: `advisor/006-backend-tests`
- One commit, e.g. `Add backend tests for stats and judging guards`.
- Do NOT push.

## Steps

### Step 1: Install the test tooling

Run `vp add -D convex-test @edge-runtime/vm`.

**Verify**: `grep -c "convex-test" package.json` prints `1`.

### Step 2: Write `convex/stats.test.ts`

Start the file with:

```ts
// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vite-plus/test";
import shardedCounter from "@convex-dev/sharded-counter/test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
```

Write a small local `setup()` that creates `convexTest(schema, modules)`,
calls `shardedCounter.register(t, "shardedCounter")`, inserts one `users`
document with `t.run((ctx) => ctx.db.insert("users", {}))`, and returns `t`
plus `asUser = t.withIdentity({ subject: userId })`.

Cases (one `test` each):

1. Signed out: `t.query(api.stats.myDodged)` resolves to `null`, and
   `t.mutation(api.stats.recordHidden, { posts: [] })` rejects with
   `Not signed in`.
2. Recording two posts makes `myDodged` return `2` and stores two `hidden`
   rows whose `url` values are `https://x.com/i/status/<id>`.
3. Recording the same two posts a second time leaves `myDodged` at `2`.
4. An id that is not all digits (use `"12a"`) rejects with `Bad post id`.
5. 201 posts rejects with `Too many posts`.

**Verify**: `vp test` → all pass, with 5 more tests than before.

### Step 3: Write `convex/jev.test.ts`

Same header (the counter registration is not needed). Two cases, both of which
fail before any network call:

1. Signed out: `t.action(api.jev.judgePosts, { posts: [] })` rejects with
   `Not signed in`.
2. Signed in with 201 posts: rejects with `Too many posts`.

Do not write a case that passes these guards.

**Verify**: `vp test` → all pass, 2 more tests.

### Step 4: Full check

**Verify**: `vp check --fix` passes.

## Test plan

This plan is the test plan. Seven new tests in two files, modelled on
`convex/adRules.test.ts` for style.

## Done criteria

- [ ] `vp test` passes and reports at least 7 more tests than before this plan
- [ ] `vp check` passes
- [ ] `grep -rn "ai-gateway" convex/*.test.ts` returns no matches
- [ ] `git status --short` lists only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- The `// @vitest-environment edge-runtime` comment is not honoured and adding
  a `test` section to `vite.config.ts` does not fix it either. Report the
  error text; read `node_modules/vite-plus/docs` for the test configuration
  before giving up.
- `convexTest` fails on the mounted auth components (an error naming
  `components.auth`, `authGithub` or `authAnonymous`). The functions under
  test do not call them, so this is unexpected; report the error.
- Plan 003 has landed and `judgePosts` now calls a rate limiter before the
  200-post check: register that component too, using its own `/test` export
  if it has one; if it has none, STOP.
- A test fails because the _code_ disagrees with "Current state". That is a
  finding, not something to fix here.

## Maintenance notes

- Plan 007 changes `judgePosts`; these tests are its safety net, and it will
  add cases for the cache.
- The model call is deliberately untested. If it is ever wrapped so it can be
  stubbed, add a happy-path test then.
- Reviewer: confirm no test can reach the network.
