import { getAuthUserId } from "@convex-dev/auth/server";
import { ShardedCounter } from "@convex-dev/sharded-counter";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";

// One counter per user: how many posts the extension has hidden for them.
const dodged = new ShardedCounter(components.shardedCounter);

/** Called by the extension with the posts it just hid on X. */
export const recordHidden = mutation({
  args: {
    posts: v.array(
      v.object({
        id: v.string(),
        reason: v.union(v.literal("promoted"), v.literal("ad"), v.literal("slop")),
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
    for (const { id, reason } of posts) {
      if (!/^\d{1,25}$/.test(id)) throw new Error("Bad post id");
      // X resolves this form to the post without needing the author's handle.
      const url = `https://x.com/i/status/${id}`;
      // A post seen again on a later visit is recorded and counted once.
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

/** The signed-in user's total, or null when signed out. */
export const myDodged = query({
  args: {},
  returns: v.union(v.number(), v.null()),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    return userId === null ? null : await dodged.count(ctx, userId);
  },
});
