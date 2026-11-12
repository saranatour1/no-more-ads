// Everything Jev is asked about a post, and how the answers become a verdict.
// Jev only judges; the decision is the truth table in `isAd` below.

export const MODEL = "typesafe/jev-1.14";

export const QUESTIONS = {
  sells: {
    type: "noul",
    instructions:
      "Does `post` promote a product, service, or brand that the reader can buy?, or has the words 'advertisement' or 'ad' in the content",
    criteria: {
      true: "The post presents something for sale or sign-up in a favourable light.",
      false: "The post is news, opinion, or personal talk, even if it names a company.",
    },
  },
  call_to_action: {
    type: "noul",
    instructions: "Does `post` tell the reader to take a commercial step?",
    criteria: {
      true: "The post urges buying, ordering, signing up, or using a discount code or link.",
      false: "The post asks nothing commercial of the reader.",
    },
  },
  paid_partnership: {
    type: "noul",
    instructions: "Does `post` disclose that it is sponsored or a paid partnership?",
    criteria: {
      true: "The post carries a disclosure such as #ad, #sponsored, or 'paid partnership'.",
      false: "The post carries no sponsorship disclosure.",
    },
  },
  // AI slop, judged from the text alone by the stock shapes it takes.
  stock_hook: {
    type: "noul",
    instructions: "Does `post` open with a stock attention-grabbing line?",
    criteria: {
      true: "The opening is a formula such as 'Here's what nobody tells you', 'Most people don't know this', or 'X changed everything'.",
      false: "The opening is specific to what the post is about.",
    },
  },
  generic_content: {
    type: "noul",
    instructions: "Is `post` made only of general advice or claims that could be about anyone?",
    criteria: {
      true: "The post names no specific person, event, place, or first-hand experience.",
      false: "The post refers to something particular the author saw, did, or is reacting to.",
    },
  },
} as const;

export type Answers = Record<keyof typeof QUESTIONS, number>;

// Starting threshold from TypeSafe's guidance; anything lower counts as "not settled".
const YES = 0.7;

/**
 * A disclosed sponsorship is an ad. Otherwise the post must sell something
 * and either push the reader to act or carry a video: a promotional video
 * makes its pitch on screen, where the model cannot see it.
 */
export function isAd({ sells, call_to_action, paid_partnership }: Answers, video = false): boolean {
  return paid_partnership > YES || (sells > YES && (call_to_action > YES || video));
}

/** Slop needs both signs: a formula opening alone, or a general post alone, is ordinary. */
export function isSlop({ stock_hook, generic_content }: Answers): boolean {
  return stock_hook > YES && generic_content > YES;
}
