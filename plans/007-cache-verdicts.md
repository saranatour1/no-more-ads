# Plan 007: A post is judged once, and one failed judgment no longer discards the batch

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git log --oneline -5 -- convex/jev.ts convex/schema.ts convex/adRules.ts`
> Plans 003 and 006 are expected to have touched `convex/jev.ts` and added
> test files. Anything else: compare the "Current state" excerpts against the
> live code; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (adds a table and changes the paid code path)
- **Depends on**: plans/006-backend-tests.md (required), plans/003-rate-limit-judging.md (recommended first)
- **Category**: bug
- **Planned at**: no commit, working tree of 2026-11-11

## Why this matters

Every post in every timeline response is sent to a paid model. Nothing
remembers the answer, so the same post is judged again on each page load and
again for each user who sees it. Separately, the batch is judged with
`Promise.all`: if one of up to 200 model calls fails, the whole batch throws,
no post in it is hidden, and the browser never asks about those posts again
during that page visit. After this plan, verdicts are stored by post id and
reused, and a failed judgment affects only its own post.

## Current state

- `convex/jev.ts` — `judge(text)` calls the model for one post;
  `judgePosts` is the public action.
- `convex/adRules.ts` — the questions asked and the rules (`isAd`, `isSlop`).
- `convex/schema.ts` — tables.
- `convex/stats.ts` — exemplar of a mutation using an index.
- `convex/_generated/ai/guidelines.md` — **read first**; Convex rules for
  this repo. Relevant: actions have no `ctx.db` and must go through
  `ctx.runQuery` / `ctx.runMutation` with `internal.*` references; internal
  functions are registered with `internalQuery` / `internalMutation`; every
  function declares argument validators; index names list their fields
  (`by_postId`).

`convex/jev.ts` today (before plan 003; plan 003 adds rate-limit calls after
the 200 check):

```ts
async function judge(text: string) {
  // ...calls the AI Gateway, throws on any failure...
  return { ad: isAd(nouls), slop: isSlop(nouls), answers: nouls };
}

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

`convex/schema.ts` today:

```ts
export default defineSchema({
  // Every post the extension hid for a user, and why.
  hidden: defineTable({
    userId: v.id("users"),
    url: v.string(),
    reason: v.union(v.literal("promoted"), v.literal("ad"), v.literal("slop")),
  }).index("by_userId_and_url", ["userId", "url"]),
  users: defineTable({/* ... */}),
});
```

The public contract of `judgePosts` (arguments and return shape) is consumed
by the browser extension and **must not change**.

## Commands you will need

`npm`/`npx` fail in this repo (pnpm is enforced).

| Purpose                    | Command                       | Expected on success                                    |
| -------------------------- | ----------------------------- | ------------------------------------------------------ |
| Push to the dev deployment | `pnpm exec convex dev --once` | `Convex functions ready!`                              |
| Format, lint, typecheck    | `vp check --fix`              | `pass: Found no warnings, lint errors, or type errors` |
| Tests                      | `vp test`                     | all pass                                               |

## Scope

**In scope**:

- `convex/schema.ts`
- `convex/adRules.ts` (one new exported constant only)
- `convex/verdicts.ts` (create)
- `convex/verdicts.test.ts` (create)
- `convex/jev.ts`

**Out of scope**:

- The wording of `QUESTIONS` and the logic of `isAd` / `isSlop`.
- `convex/stats.ts` and the `hidden` table.
- Anything under `extension/` or `src/`.
- Expiring or pruning old verdicts.

## Git workflow

- Branch: `advisor/007-cache-verdicts`
- Commit per step is fine; message style e.g. `Cache post verdicts by id`.
- Do NOT push.

## Steps

### Step 1: Add a rules version and the table

In `convex/adRules.ts`, add:

```ts
// Bump when QUESTIONS or the rules change, so stored verdicts are re-judged.
export const RULES_VERSION = 1;
```

In `convex/schema.ts`, add a table:

```ts
  // One model verdict per post, shared by all users, so a post is judged once.
  verdicts: defineTable({
    postId: v.string(),
    rulesVersion: v.number(),
    reason: v.union(v.literal("ad"), v.literal("slop"), v.literal("none")),
  }).index("by_postId", ["postId"]),
```

**Verify**: `pnpm exec convex dev --once` → `Convex functions ready!`

### Step 2: Add internal read and write functions

Create `convex/verdicts.ts` with:

- `lookup`: `internalQuery`, args `{ postIds: v.array(v.string()) }`, returns
  an array of `{ postId, reason }` for ids that have a stored verdict whose
  `rulesVersion` equals `RULES_VERSION`. One indexed `.first()` read per id.
- `save`: `internalMutation`, args
  `{ verdicts: v.array(v.object({ postId: v.string(), reason: <the three literals> })) }`,
  returns `v.null()`. For each: find the existing row by `by_postId`; if there
  is one, `ctx.db.patch` it with the new `reason` and `RULES_VERSION`;
  otherwise insert.

**Verify**: `pnpm exec convex dev --once` → `Convex functions ready!`;
`vp check --fix` passes.

### Step 3: Use the cache in `judgePosts`

Rewrite only the body after the guards (keep sign-in check, 200 cap, and any
rate-limit code from plan 003):

1. `const cached = await ctx.runQuery(internal.verdicts.lookup, { postIds })`.
2. `misses` = posts whose id is not in `cached`.
3. If plan 003's rate limiter is present, consume it for `misses.length`
   instead of `posts.length`, and skip it when there are no misses.
4. Judge misses with `Promise.allSettled`. For fulfilled results compute
   `reason`: `"ad"` if `ad`, else `"slop"` if `slop`, else `"none"`.
   For rejected results, `console.error` one line with the post id (not its
   text) and leave the post out: not cached, not hidden.
5. If there are new verdicts, `await ctx.runMutation(internal.verdicts.save, ...)`.
6. Return, in the original post order, `{ id, reason }` for every post whose
   cached or new reason is `"ad"` or `"slop"`.

Add a comment where rejected results are skipped: a failed judgment is retried
on a later visit, because nothing was stored for it.

**Verify**: `pnpm exec convex dev --once` → `Convex functions ready!`;
`vp check --fix` passes.

### Step 4: Tests

Create `convex/verdicts.test.ts`, modelled on the test files plan 006 added
(same header lines and `convexTest` setup; no counter registration needed).
Cases:

1. `lookup` on unknown ids returns `[]`.
2. After `save` of `[{postId:"1",reason:"ad"},{postId:"2",reason:"none"}]`,
   `lookup(["1","2","3"])` returns exactly those two.
3. `save` twice for the same `postId` leaves one row with the latest reason.
4. A row inserted directly with `rulesVersion: RULES_VERSION - 1` is not
   returned by `lookup`.

Call internal functions with `t.query(internal.verdicts.lookup, ...)` and
`t.mutation(internal.verdicts.save, ...)`.

**Verify**: `vp test` → all pass, 4 more tests; the tests from plan 006 still pass.

### Step 5: Confirm on the dev deployment

Find a dev user id with `pnpm exec convex data users --limit 1`, then run this
twice, substituting the id for `<ID>`:

```
pnpm exec convex run jev:judgePosts '{"posts":[{"id":"900000000000000001","text":"Stuck on the train again."}]}' --identity '{"subject":"<ID>","issuer":"test","tokenIdentifier":"test|<ID>"}'
```

**Verify**: both runs print `[]`, and `pnpm exec convex data verdicts` shows
exactly one row for `900000000000000001` with reason `none`.

## Test plan

Covered by Step 4. The action's model call stays untested by automation;
Step 5 is its manual check and costs one model call.

## Done criteria

- [ ] `vp test` passes with 4 new tests in `convex/verdicts.test.ts`
- [ ] `vp check` passes
- [ ] `grep -c "Promise.all(" convex/jev.ts` prints `0`
- [ ] `grep -c "allSettled" convex/jev.ts` prints `1`
- [ ] The `returns:` validator of `judgePosts` is unchanged
- [ ] Step 5 shows one `verdicts` row after two identical calls
- [ ] `git status --short` lists only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- Plan 006's test files do not exist (`ls convex/*.test.ts` shows only
  `adRules.test.ts`). This plan must not land without them.
- The change would alter `judgePosts`'s arguments or return shape.
- `convex dev --once` reports a schema validation failure against existing data.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **Whenever `QUESTIONS`, `isAd` or `isSlop` change, bump `RULES_VERSION`**,
  or old verdicts keep being served.
- Verdicts are keyed by post id only. An edited post keeps its old verdict.
  Accepted: edits are rare and the cost of being wrong is one post.
- The table grows without bound. If it becomes large, add a scheduled cleanup
  of rows with an old `rulesVersion`.
- Reviewer: check that a rejected judgment is neither cached nor returned, and
  that the rate limiter (if present) is charged for misses only.
