# Plan 003: Judging posts is rate-limited per user and capped per day

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git log --oneline -3 -- convex/jev.ts convex/convex.config.ts`
> If either changed after the baseline commit, compare the "Current state"
> excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: plans/001-first-commit-and-ci.md
- **Category**: security
- **Planned at**: no commit, working tree of 2026-11-11

## Why this matters

`judgePosts` sends each post to a paid model through the Convex AI Gateway,
billed to the project's Convex team. One call is capped at 200 posts, but the
number of calls is unlimited. Sign-in is the only gate, and on the dev
deployment anyone can sign in as a guest with one click. A single client in a
loop can therefore spend without bound. After this plan, each user has a
per-minute allowance and the whole deployment has a daily ceiling.

## Current state

- `convex/jev.ts` — the action that judges posts.
- `convex/convex.config.ts` — mounts Convex components (auth, sharded counter).
- `convex/stats.ts` — exemplar of using a component from app code.
- `convex/_generated/ai/guidelines.md` — **read this first**; it holds the
  Convex rules for this repo and overrides general knowledge.

`convex/jev.ts:36-51` today:

```ts
export const judgePosts = action({
  args: { posts: v.array(v.object({ id: v.string(), text: v.string() })) },
  returns: v.array(
    v.object({ id: v.string(), reason: v.union(v.literal("ad"), v.literal("slop")) }),
  ),
  handler: async (ctx, { posts }) => {
    if ((await getAuthUserId(ctx)) === null) throw new Error("Not signed in");
    // Bounds on what one call can spend.
    if (posts.length > 200) throw new Error("Too many posts");
    const verdicts = await Promise.all(posts.map(({ text }) => judge(text.slice(0, 4000))));
    return posts.flatMap(({ id }, i) => {
      const { ad, slop } = verdicts[i];
      return ad || slop ? [{ id, reason: ad ? ("ad" as const) : ("slop" as const) }] : [];
    });
  },
});
```

`convex/convex.config.ts` ends with:

```ts
app.use(authAnonymous);
app.use(shardedCounter);

export default app;
```

How a component is used from app code (`convex/stats.ts:1-8`):

```ts
import { ShardedCounter } from "@convex-dev/sharded-counter";
import { components } from "./_generated/api";
const dodged = new ShardedCounter(components.shardedCounter);
```

The extension's background script already treats a failed `judgePosts` call as
"hide nothing" and logs it, so a rate-limit error needs no client change.

## Commands you will need

`npm`/`npx` fail in this repo (pnpm is enforced).

| Purpose                    | Command                       | Expected on success                                    |
| -------------------------- | ----------------------------- | ------------------------------------------------------ |
| Add a dependency           | `vp add <package>`            | exit 0                                                 |
| Push to the dev deployment | `pnpm exec convex dev --once` | `Convex functions ready!`                              |
| Format, lint, typecheck    | `vp check --fix`              | `pass: Found no warnings, lint errors, or type errors` |
| Tests                      | `vp test`                     | all pass                                               |

## Scope

**In scope**:

- `package.json`, `pnpm-lock.yaml` (via `vp add`)
- `convex/convex.config.ts`
- `convex/jev.ts`

**Out of scope**:

- `convex/stats.ts`, `convex/users.ts`, `convex/auth.ts`.
- Anything under `extension/` or `src/`.
- Turning guest sign-in off. The owner relies on it until GitHub sign-in is set up.
- `probe` in `convex/jev.ts` — it is internal and reachable only from the CLI.

## Git workflow

- Branch: `advisor/003-rate-limit-judging`
- One commit, e.g. `Rate-limit post judging`.
- Do NOT push.

## Steps

### Step 1: Install and mount the rate limiter component

Run `vp add @convex-dev/rate-limiter`. Then read
`node_modules/@convex-dev/rate-limiter/README.md` — it is the source of truth
for the API used below. In `convex/convex.config.ts`, import its config the way
the README shows and add `app.use(rateLimiter);` after `app.use(shardedCounter);`.

**Verify**: `pnpm exec convex dev --once` prints `Installed component rateLimiter`
(first run) and `Convex functions ready!`.

### Step 2: Define two limits and apply them

In `convex/jev.ts`, create a `RateLimiter` over `components.rateLimiter` with
two named limits (use the exact option names from the README):

- `judgePerUser`: token bucket, 300 posts per minute, capacity 600.
- `judgeDaily`: fixed window, 50,000 posts per day, no key (deployment-wide).

In the `judgePosts` handler, keep the sign-in check and the 200 cap, store the
user id in a variable, and before judging consume `posts.length` units from
both limits, throwing when either is exceeded (the README's `throws: true`
form). Skip both when `posts.length === 0`. Add one comment line above the
limits explaining why: every judged post is billed.

Typical use is 20–40 posts per timeline response and a few responses per
minute, so 300 per minute does not affect normal scrolling.

**Verify**: `pnpm exec convex dev --once` → `Convex functions ready!`;
`vp check --fix` passes.

### Step 3: Confirm on the dev deployment

Find a dev user id: `pnpm exec convex data users --limit 1`. Then, substituting
that id for `<ID>`:

```
pnpm exec convex run jev:judgePosts '{"posts":[{"id":"1","text":"Stuck on the train again."}]}' --identity '{"subject":"<ID>","issuer":"test","tokenIdentifier":"test|<ID>"}'
```

**Verify**: prints `[]` (the post is not an ad). Then run the same command
without `--identity`; it must print an error containing `Not signed in`.

Do not try to exhaust the limit against the live model; that spends money.

## Test plan

No automated test in this plan. Plan 006 adds a backend test harness; add a
limiter test there if it has landed. Report that the limit itself was not
exercised.

## Done criteria

- [ ] `grep -c "rateLimiter" convex/convex.config.ts` prints at least `2`
- [ ] `grep -c "judgePerUser" convex/jev.ts` prints at least `2`
- [ ] `pnpm exec convex dev --once` prints `Convex functions ready!`
- [ ] `vp check` and `vp test` pass
- [ ] The Step 3 signed-in call returns `[]` and the signed-out call errors
- [ ] `git status --short` lists only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- The README's API differs so much that a limit cannot be consumed from an
  action. Report what it does support.
- `convex dev --once` asks for login or to choose a project. The deployment is
  already configured in `.env.local`; do not reconfigure it.
- The excerpts in "Current state" don't match the live files.

## Maintenance notes

- Plan 007 adds a verdict cache. Once it lands, consume the limits only for
  posts that miss the cache; otherwise cached posts eat allowance for nothing.
- The numbers are first guesses. The Convex dashboard's AI Gateway usage page
  shows real spend; tune from that.
- Reviewer: check the limiter is consumed _before_ any model call, and that a
  zero-length batch consumes nothing.
