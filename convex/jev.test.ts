// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vite-plus/test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { verdictKey } from "./verdicts";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  return { t, asUser: t.withIdentity({ subject: userId }) };
}

test("signed out: judgePosts rejects", async () => {
  const { t } = await setup();
  await expect(t.action(api.jev.judgePosts, { posts: [] })).rejects.toThrow("Not signed in");
});

test("more than 200 posts is rejected", async () => {
  const { asUser } = await setup();
  const posts = Array.from({ length: 201 }, (_, i) => ({ id: String(i + 1), text: "x" }));
  await expect(asUser.action(api.jev.judgePosts, { posts })).rejects.toThrow("Too many posts");
});

test("posts with stored verdicts are answered without judging", async () => {
  const { t, asUser } = await setup();
  const keys = [await verdictKey("buy now", false), await verdictKey("hello", false)];
  await t.mutation(internal.verdicts.save, {
    verdicts: [
      { key: keys[0], reason: "ad" },
      { key: keys[1], reason: "none" },
    ],
  });
  const posts = [
    { id: "1", text: "buy now" },
    { id: "2", text: "hello" },
  ];
  expect(await asUser.action(api.jev.judgePosts, { posts })).toEqual([{ id: "1", reason: "ad" }]);
});

test("zero posts resolves to an empty list", async () => {
  const { asUser } = await setup();
  expect(await asUser.action(api.jev.judgePosts, { posts: [] })).toEqual([]);
});
