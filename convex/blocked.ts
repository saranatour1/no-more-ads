import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Enough for a personal list, and keeps `list` a single bounded read.
const MAX_TERMS = 200;

/** The signed-in user's blocked words and sites, or null when signed out. */
export const list = query({
  args: {},
  returns: v.union(v.null(), v.array(v.string())),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const rows = await ctx.db
      .query("blocked")
      .withIndex("by_userId_and_term", (q) => q.eq("userId", userId))
      .take(MAX_TERMS);
    return rows.map((row) => row.term);
  },
});

/** Block a word or site. Posts containing it are hidden without asking the model. */
export const add = mutation({
  args: { term: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    // Stored lower-case: matching ignores case.
    const term = args.term.trim().toLowerCase();
    if (term.length < 2 || term.length > 100) throw new Error("Bad term");
    const mine = await ctx.db
      .query("blocked")
      .withIndex("by_userId_and_term", (q) => q.eq("userId", userId))
      .take(MAX_TERMS);
    if (mine.some((row) => row.term === term)) return null;
    if (mine.length >= MAX_TERMS) throw new Error("Too many blocked terms");
    await ctx.db.insert("blocked", { userId, term });
    return null;
  },
});

export const remove = mutation({
  args: { term: v.string() },
  returns: v.null(),
  handler: async (ctx, { term }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const row = await ctx.db
      .query("blocked")
      .withIndex("by_userId_and_term", (q) => q.eq("userId", userId).eq("term", term))
      .first();
    if (row !== null) await ctx.db.delete("blocked", row._id);
    return null;
  },
});
