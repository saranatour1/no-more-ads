import { expect, test } from "vite-plus/test";
import { readTimeline } from "./promoted";

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
    posts: [{ id: "1", text: "post 1" }],
  });
  // A non-JSON body, and one with no posts.
  expect(readTimeline("rest_id <html>")).toEqual({ promoted: [], posts: [] });
  expect(readTimeline('{"ok":true}')).toEqual({ promoted: [], posts: [] });
});
