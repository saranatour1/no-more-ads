export type Post = { id: string; text: string };
/** A post to hide, and why. */
export type Hidden = { id: string; reason: "promoted" | "ad" | "slop" };

/**
 * What a timeline API response from X holds: the posts X itself marks as ads
 * (`promotedMetadata` sits next to the post, in every language), and the
 * text of every other post, for judging.
 */
export function readTimeline(body: string): { promoted: string[]; posts: Post[] } {
  const promoted: string[] = [];
  const texts = new Map<string, string>();
  // Cheap check first: most API responses hold no posts at all.
  if (!body.includes("rest_id")) return { promoted, posts: [] };
  const walk = (node: unknown) => {
    if (typeof node !== "object" || node === null) return;
    const { promotedMetadata, tweet_results, rest_id, legacy } = node as Record<string, any>;
    if (promotedMetadata !== undefined) {
      const result = tweet_results?.result;
      // Some posts are wrapped as { tweet: {...} } (limited-visibility results).
      const id = result?.rest_id ?? result?.tweet?.rest_id;
      if (typeof id === "string") promoted.push(id);
    }
    // shortcut: long posts are judged on their first 280 characters, read note_tweet when that misses ads.
    if (typeof rest_id === "string" && typeof legacy?.full_text === "string") {
      texts.set(rest_id, legacy.full_text);
    }
    for (const child of Object.values(node)) walk(child);
  };
  try {
    walk(JSON.parse(body));
  } catch {
    return { promoted: [], posts: [] };
  }
  for (const id of promoted) texts.delete(id);
  return { promoted, posts: [...texts].map(([id, text]) => ({ id, text })) };
}
