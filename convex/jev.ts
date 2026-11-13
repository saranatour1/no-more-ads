import { getAuthUserId } from "@convex-dev/auth/server";
import { DAY, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { getServiceToken } from "convex/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import { type Answers, isAd, isSlop, MODEL, QUESTIONS } from "./adRules";
import { verdictKey } from "./verdicts";

type Reason = "ad" | "slop" | "none";

// `video` is optional so older copies of the extension keep working.
const args = { text: v.string(), video: v.optional(v.boolean()) };

async function judge(text: string, video = false) {
  const response = await fetch("https://ai-gateway.convex.dev/alpha/decisions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getServiceToken("ai-gateway")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      state: { post: text },
      questions: QUESTIONS,
      // Only endpoints that keep no copy of the post; the call fails if none is available.
      provider: { zdr: true },
    }),
  });
  // A failed call is an error, never a "not an ad".
  if (!response.ok) throw new Error(`Jev request failed: ${response.status}`);
  const { answers } = (await response.json()) as {
    answers: Record<string, { noul?: number }>;
  };
  const nouls = {} as Answers;
  for (const name of Object.keys(QUESTIONS) as (keyof Answers)[]) {
    const noul = answers[name]?.noul;
    if (typeof noul !== "number") throw new Error(`Jev gave no answer for ${name}`);
    nouls[name] = noul;
  }
  return { ad: isAd(nouls, video), slop: isSlop(nouls), answers: nouls };
}

// Every judged post is billed, so cap what one user and the whole deployment can spend.
const rateLimiter = new RateLimiter(components.rateLimiter, {
  judgePerUser: { kind: "token bucket", rate: 300, period: MINUTE, capacity: 600 },
  judgeDaily: { kind: "fixed window", rate: 50_000, period: DAY },
});

/**
 * Which of these posts are adverts or AI slop? Returns each with the reason. Signed-in users only,
 * since every post judged costs money.
 */
export const judgePosts = action({
  args: { posts: v.array(v.object({ id: v.string(), ...args })) },
  returns: v.array(
    v.object({ id: v.string(), reason: v.union(v.literal("ad"), v.literal("slop")) }),
  ),
  handler: async (ctx, { posts }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    // Bounds on what one call can spend.
    if (posts.length > 200) throw new Error("Too many posts");
    const items = [];
    for (const { id, text, video } of posts) {
      const clipped = text.slice(0, 4000);
      const isVideo = video ?? false;
      items.push({ id, text: clipped, video: isVideo, key: await verdictKey(clipped, isVideo) });
    }
    const cached: { key: string; reason: Reason }[] =
      items.length > 0
        ? await ctx.runQuery(internal.verdicts.lookup, {
            keys: [...new Set(items.map((i) => i.key))],
          })
        : [];
    const reasons = new Map<string, Reason>(cached.map(({ key, reason }) => [key, reason]));
    // Identical content is judged once.
    const misses = [
      ...new Map(items.filter((i) => !reasons.has(i.key)).map((i) => [i.key, i])).values(),
    ];
    if (misses.length > 0) {
      const count = misses.length;
      await rateLimiter.limit(ctx, "judgePerUser", { key: userId, count, throws: true });
      await rateLimiter.limit(ctx, "judgeDaily", { count, throws: true });
    }
    const results = await Promise.allSettled(misses.map((m) => judge(m.text, m.video)));
    const fresh: { key: string; reason: Reason }[] = [];
    results.forEach((result, i) => {
      // A failed judgment is retried on a later visit, because nothing was stored for it.
      if (result.status === "rejected") {
        console.error(`judgment failed for ${misses[i].key}`);
        return;
      }
      const { ad, slop } = result.value;
      fresh.push({ key: misses[i].key, reason: ad ? "ad" : slop ? "slop" : "none" });
    });
    if (fresh.length > 0) {
      await ctx.runMutation(internal.verdicts.save, { verdicts: fresh });
      for (const { key, reason } of fresh) reasons.set(key, reason);
    }
    return items.flatMap(({ id, key }) => {
      const reason = reasons.get(key);
      return reason === "ad" || reason === "slop" ? [{ id, reason }] : [];
    });
  },
});

// For trying questions from the CLI: `convex run jev:probe '{"text":"..."}'`.
export const probe = internalAction({
  args,
  handler: (_ctx, { text, video }) => judge(text, video),
});
