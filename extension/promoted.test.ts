import { expect, test } from "vite-plus/test";
import { isBlocked, readTimeline, saysAd } from "./promoted";

const entry = (id: string, ad: boolean, wrapped = false) => {
  const post = { rest_id: id, legacy: { full_text: `post ${id}` } };
  return {
    entryId: `tweet-${id}`,
    content: {
      itemContent: {
        tweet_results: { result: wrapped ? { tweet: post } : post },
        ...(ad && { promotedMetadata: { advertiser_results: {} } }),
      },
    },
  };
};

test("readTimeline splits a response into X's own ads and posts to judge", () => {
  const body = JSON.stringify({
    data: { home: { instructions: [{ entries: [entry("1", false), entry("2", true)] }] } },
    // A user object has a rest_id too, but no post text.
    more: [entry("3", true, true), { rest_id: "99", legacy: { name: "someone" } }],
  });
  expect(readTimeline(body)).toEqual({
    promoted: ["2", "3"],
    posts: [{ id: "1", text: "post 1", video: false, links: [] }],
  });
  // A non-JSON body, and one with no posts.
  expect(readTimeline("rest_id <html>")).toEqual({ promoted: [], posts: [] });
  expect(readTimeline('{"ok":true}')).toEqual({ promoted: [], posts: [] });
});

test("readTimeline marks posts that carry a video", () => {
  const post = {
    rest_id: "7",
    legacy: {
      full_text: "watch this https://t.co/abc",
      extended_entities: { media: [{ type: "video" }] },
      entities: { urls: [{ expanded_url: "https://shop.example.com/deal" }] },
    },
  };
  expect(readTimeline(JSON.stringify({ post })).posts).toEqual([
    {
      id: "7",
      text: "watch this https://t.co/abc",
      video: true,
      links: ["https://shop.example.com/deal"],
    },
  ]);
});

test("saysAd matches ad words as whole words only", () => {
  expect(saysAd("New drop! #ad")).toBe(true);
  expect(saysAd("Sponsored by Acme")).toBe(true);
  expect(saysAd("This is an AD.")).toBe(true);
  // Words that merely contain the letters.
  expect(saysAd("My dad made bread")).toBe(false);
  expect(saysAd("Adding a new feature to the roadmap")).toBe(false);
  expect(saysAd("")).toBe(false);
});

test("isBlocked matches blocked words and sites, ignoring case", () => {
  const post = {
    text: "Big Crypto giveaway https://t.co/abc",
    links: ["https://shop.example.com/x"],
  };
  expect(isBlocked(post, ["crypto"])).toBe(true);
  expect(isBlocked(post, ["Example.com"])).toBe(true);
  expect(isBlocked(post, ["football", ""])).toBe(false);
  expect(isBlocked(post, [])).toBe(false);
});
