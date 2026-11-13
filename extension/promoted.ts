export type Post = { id: string; text: string; video: boolean; links: string[] };
/** A post to hide, and why. */
export type Hidden = { id: string; reason: "promoted" | "ad" | "slop" | "blocked" };
/** What the backend records: a post on X by id, or an ad anywhere else by its link. */
export type Recorded = Hidden | { url: string; reason: Hidden["reason"] };

/**
 * What a timeline API response from X holds: the posts X itself marks as ads
 * (`promotedMetadata` sits next to the post, in every language), and the
 * text of every other post, for judging.
 */
export function readTimeline(body: string): { promoted: string[]; posts: Post[] } {
  const promoted: string[] = [];
  const found = new Map<string, Post>();
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
      const media: { type?: string }[] = legacy.extended_entities?.media ?? [];
      // The text only holds shortened links; these are where they really go.
      const urls: { expanded_url?: string }[] = legacy.entities?.urls ?? [];
      found.set(rest_id, {
        id: rest_id,
        text: legacy.full_text,
        video: media.some(({ type }) => type === "video"),
        links: urls.flatMap(({ expanded_url }) => (expanded_url ? [expanded_url] : [])),
      });
    }
    for (const child of Object.values(node)) walk(child);
  };
  try {
    walk(JSON.parse(body));
  } catch {
    return { promoted: [], posts: [] };
  }
  for (const id of promoted) found.delete(id);
  return { promoted, posts: [...found.values()] };
}

// shortcut: English words only, and a post that merely talks about an ad matches too; narrow the list if real posts go missing.
const AD_WORDS = /(^|[^\p{L}\p{N}])#?(ad|ads|advert|advertisement|sponsored)(?![\p{L}\p{N}])/iu;

/** True when the post's own text says it is an ad, so no model call is needed. */
export const saysAd = (text: string) => AD_WORDS.test(text);

/** True when the post's text or links contain one of the user's blocked words or sites. */
export function isBlocked({ text, links }: Pick<Post, "text" | "links">, terms: string[]): boolean {
  const haystack = [text, ...links].join(" ").toLowerCase();
  return terms.some((term) => term !== "" && haystack.includes(term.toLowerCase()));
}
