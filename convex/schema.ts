import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Every post the extension hid for a user, and why.
  hidden: defineTable({
    userId: v.id("users"),
    url: v.string(),
    reason: v.union(v.literal("promoted"), v.literal("ad"), v.literal("slop")),
  })
    .index("by_userId_and_url", ["userId", "url"])
    .index("by_userId", ["userId"]),
  users: defineTable({
    // Absent for guests.
    login: v.optional(v.string()),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  }),
});
