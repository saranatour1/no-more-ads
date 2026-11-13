import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { RULES_VERSION } from "./adRules";

const verdictReason = v.union(v.literal("ad"), v.literal("slop"), v.literal("none"));

// Keyed by content, not post id: the client chooses the id, so an id-keyed cache could be poisoned.
export async function verdictKey(text: string, video: boolean): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify([RULES_VERSION, video, text]));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const lookup = internalQuery({
  args: { keys: v.array(v.string()) },
  returns: v.array(v.object({ key: v.string(), reason: verdictReason })),
  handler: async (ctx, { keys }) => {
    const found = [];
    for (const key of keys) {
      const row = await ctx.db
        .query("verdicts")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();
      if (row) found.push({ key, reason: row.reason });
    }
    return found;
  },
});

export const save = internalMutation({
  args: { verdicts: v.array(v.object({ key: v.string(), reason: verdictReason })) },
  returns: v.null(),
  handler: async (ctx, { verdicts }) => {
    for (const { key, reason } of verdicts) {
      // Same key means same content and rules, so a stored verdict stands.
      const existing = await ctx.db
        .query("verdicts")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();
      if (!existing) await ctx.db.insert("verdicts", { key, reason });
    }
    return null;
  },
});
