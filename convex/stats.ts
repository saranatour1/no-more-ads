import { TableAggregate } from "@convex-dev/aggregate";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ShardedCounter } from "@convex-dev/sharded-counter";
import { type Infer, v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { reason } from "./schema";

const REASONS = reason.members.map((member) => member.value);

// Hidden posts per user, ordered by reason then time, so the settings page can
// count by reason and by day over the whole history without reading the rows.
const hiddenCounts = new TableAggregate<{
  Namespace: Id<"users">;
  Key: [Infer<typeof reason>, number];
  DataModel: DataModel;
  TableName: "hidden";
}>(components.aggregate, {
  namespace: (doc) => doc.userId,
  sortKey: (doc) => [doc.reason, doc._creationTime],
});

// One counter per user: how many posts the extension has hidden for them.
const dodged = new ShardedCounter(components.shardedCounter);

/** Called by the extension with what it just hid: posts on X by id, ads elsewhere by their link. */
export const recordHidden = mutation({
  args: {
    posts: v.array(
      v.object({
        id: v.optional(v.string()),
        url: v.optional(v.string()),
        reason: reason,
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { posts }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    // One timeline response never holds more posts than this.
    if (posts.length > 200) throw new Error("Too many posts");
    let added = 0;
    for (const { id, reason, ...post } of posts) {
      if (
        id === undefined ? !/^https?:\/\/\S{1,500}$/.test(post.url ?? "") : !/^\d{1,25}$/.test(id)
      )
        throw new Error("Bad post id");
      // X resolves this form to the post without needing the author's handle.
      const url = id === undefined ? post.url! : `https://x.com/i/status/${id}`;
      // A post seen again on a later visit is recorded and counted once.
      const seen = await ctx.db
        .query("hidden")
        .withIndex("by_userId_and_url", (q) => q.eq("userId", userId).eq("url", url))
        .first();
      if (seen !== null) continue;
      const row = await ctx.db.insert("hidden", { userId, url, reason });
      // "IfDoesNotExist" so this and the backfill below can't count a row twice.
      await hiddenCounts.insertIfDoesNotExist(ctx, (await ctx.db.get("hidden", row))!);
      added++;
    }
    if (added > 0) await dodged.add(ctx, userId, added);
    return null;
  },
});

/** The signed-in user's total, or null when signed out. */
export const myDodged = query({
  args: {},
  returns: v.union(v.number(), v.null()),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    return userId === null ? null : await dodged.count(ctx, userId);
  },
});

/**
 * The signed-in user's hidden posts counted by reason (all time), and between
 * each pair of `days` (timestamps, oldest first: the browser's local
 * midnights, so days match the user's clock). Null when signed out.
 */
export const myBreakdown = query({
  args: { days: v.array(v.number()) },
  returns: v.union(
    v.null(),
    v.object({
      byReason: v.array(v.object({ reason, count: v.number() })),
      byDay: v.array(v.number()),
    }),
  ),
  handler: async (ctx, { days }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    if (days.length < 2 || days.length > 32) throw new Error("Bad days");
    const spans = days.slice(1).map((end, i) => [days[i], end]);
    const counts = await hiddenCounts.countBatch(ctx, [
      ...REASONS.map((r) => ({ namespace: userId, bounds: { prefix: [r] as [typeof r] } })),
      ...spans.flatMap(([start, end]) =>
        REASONS.map((r) => ({
          namespace: userId,
          bounds: {
            lower: { key: [r, start] as [typeof r, number], inclusive: true },
            upper: { key: [r, end] as [typeof r, number], inclusive: false },
          },
        })),
      ),
    ]);
    const n = REASONS.length;
    return {
      byReason: REASONS.map((r, i) => ({ reason: r, count: counts[i] })),
      byDay: spans.map((_, day) =>
        counts.slice(n * (day + 1), n * (day + 2)).reduce((sum, count) => sum + count, 0),
      ),
    };
  },
});

// Run once after deploying: `convex run stats:backfillHiddenCounts`. Counts the rows stored before the aggregate existed.
export const backfillHiddenCounts = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const { page, isDone, continueCursor } = await ctx.db
      .query("hidden")
      .paginate({ cursor: cursor ?? null, numItems: 200 });
    for (const doc of page) await hiddenCounts.insertIfDoesNotExist(ctx, doc);
    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.stats.backfillHiddenCounts, {
        cursor: continueCursor,
      });
    }
    return null;
  },
});

/** The signed-in user's 20 most recently hidden posts, or null when signed out. */
export const myHidden = query({
  args: {},
  returns: v.union(
    v.null(),
    v.array(
      v.object({
        url: v.string(),
        reason: reason,
        hiddenAt: v.number(),
      }),
    ),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const rows = await ctx.db
      .query("hidden")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);
    return rows.map((row) => ({ url: row.url, reason: row.reason, hiddenAt: row._creationTime }));
  },
});
