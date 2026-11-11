import { getAuthUserId } from "@convex-dev/auth/server";
import { getServiceToken } from "convex/server";
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { type Answers, isAd, isSlop, MODEL, QUESTIONS } from "./adRules";

const args = { text: v.string() };

async function judge(text: string) {
  const response = await fetch("https://ai-gateway.convex.dev/alpha/decisions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getServiceToken("ai-gateway")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, state: { post: text }, questions: QUESTIONS }),
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
  return { ad: isAd(nouls), slop: isSlop(nouls), answers: nouls };
}

/**
 * Which of these posts are adverts or AI slop? Returns each with the reason. Signed-in users only,
 * since every post judged costs money.
 */
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

// For trying questions from the CLI: `convex run jev:probe '{"text":"..."}'`.
export const probe = internalAction({ args, handler: (_ctx, { text }) => judge(text) });
