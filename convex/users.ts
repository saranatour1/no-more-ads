import { getAuthUserId } from "@convex-dev/auth/server";
import { vGithubProfile } from "@convex-dev/auth/methods/github/server";
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

export const createUser = internalMutation({
  args: {
    provider: v.object({
      name: v.literal("github"),
      accountId: v.string(),
      profile: vGithubProfile,
    }),
  },
  returns: v.id("users"),
  handler: async (ctx, { provider: { profile } }) => {
    return await ctx.db.insert("users", {
      login: profile.login,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    });
  },
});

// Guest sign-in is for development: it only works on deployments where
// AUTH_ALLOW_GUEST is set to "true".
export const createGuest = internalMutation({
  args: {
    provider: v.object({
      name: v.literal("anonymous"),
      accountId: v.string(),
      profile: v.object({}),
    }),
  },
  returns: v.id("users"),
  handler: async (ctx) => {
    if (process.env.AUTH_ALLOW_GUEST !== "true") {
      throw new Error("Guest sign-in is disabled on this deployment");
    }
    return await ctx.db.insert("users", {});
  },
});

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    return userId === null ? null : await ctx.db.get("users", userId);
  },
});
