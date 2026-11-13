import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/** Why a post was hidden: X's own ad marker, an advert, AI slop, or a blocked word or site. */
export const reason = v.union(
  v.literal("promoted"),
  v.literal("ad"),
  v.literal("slop"),
  v.literal("blocked"),
);

export default defineSchema({
  // Words and sites a user never wants to see posts about.
  blocked: defineTable({
    userId: v.id("users"),
    term: v.string(),
  }).index("by_userId_and_term", ["userId", "term"]),
  // Every post the extension hid for a user, and why.
  hidden: defineTable({
    userId: v.id("users"),
    url: v.string(),
    reason,
  })
    .index("by_userId_and_url", ["userId", "url"])
    .index("by_userId", ["userId"]),
  // One model verdict per distinct post content, shared by all users, so the
  // same post is judged once. `key` is a hash; see verdictKey.
  verdicts: defineTable({
    key: v.string(),
    reason: v.union(v.literal("ad"), v.literal("slop"), v.literal("none")),
  }).index("by_key", ["key"]),
  users: defineTable({
    // Absent for guests.
    login: v.optional(v.string()),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  }),
});
