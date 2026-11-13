// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vite-plus/test";
import aggregate from "@convex-dev/aggregate/test";
import shardedCounter from "@convex-dev/sharded-counter/test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  shardedCounter.register(t, "shardedCounter");
  aggregate.register(t, "aggregate");
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  return { t, asUser: t.withIdentity({ subject: userId }) };
}

test("signed out: myDodged is null and recordHidden rejects", async () => {
  const { t } = await setup();
  expect(await t.query(api.stats.myDodged)).toBeNull();
  await expect(t.mutation(api.stats.recordHidden, { posts: [] })).rejects.toThrow("Not signed in");
});

test("recording two posts counts two and stores their urls", async () => {
  const { t, asUser } = await setup();
  await asUser.mutation(api.stats.recordHidden, {
    posts: [
      { id: "1", reason: "ad" },
      { id: "2", reason: "slop" },
    ],
  });
  expect(await asUser.query(api.stats.myDodged)).toBe(2);
  const rows = await t.run((ctx) => ctx.db.query("hidden").collect());
  expect(rows.map((r) => r.url).sort()).toEqual([
    "https://x.com/i/status/1",
    "https://x.com/i/status/2",
  ]);
});

test("recording the same posts again does not count them twice", async () => {
  const { asUser } = await setup();
  const posts = [
    { id: "1", reason: "ad" as const },
    { id: "2", reason: "slop" as const },
  ];
  await asUser.mutation(api.stats.recordHidden, { posts });
  await asUser.mutation(api.stats.recordHidden, { posts });
  expect(await asUser.query(api.stats.myDodged)).toBe(2);
});

test("a post id that is not all digits is rejected", async () => {
  const { asUser } = await setup();
  await expect(
    asUser.mutation(api.stats.recordHidden, { posts: [{ id: "12a", reason: "ad" }] }),
  ).rejects.toThrow("Bad post id");
});

test("an ad on another site is recorded by its link, once", async () => {
  const { asUser } = await setup();
  const posts = [
    { url: "https://www.reddit.com/user/acme/comments/1", reason: "promoted" as const },
  ];
  await asUser.mutation(api.stats.recordHidden, { posts });
  await asUser.mutation(api.stats.recordHidden, { posts });
  expect(await asUser.query(api.stats.myDodged)).toBe(1);
  await expect(
    asUser.mutation(api.stats.recordHidden, { posts: [{ url: "javascript:1", reason: "ad" }] }),
  ).rejects.toThrow("Bad post id");
});

test("myBreakdown counts by reason and between the given days", async () => {
  const { t, asUser } = await setup();
  expect(await t.query(api.stats.myBreakdown, { days: [0, 1] })).toBeNull();
  await asUser.mutation(api.stats.recordHidden, {
    posts: [
      { id: "1", reason: "ad" },
      { id: "2", reason: "ad" },
      { id: "3", reason: "slop" },
    ],
  });
  const now = Date.now();
  const got = await asUser.query(api.stats.myBreakdown, { days: [0, now - 60_000, now + 60_000] });
  expect(got?.byReason.filter(({ count }) => count > 0)).toEqual([
    { reason: "ad", count: 2 },
    { reason: "slop", count: 1 },
  ]);
  expect(got?.byDay).toEqual([0, 3]);
});

test("more than 200 posts is rejected", async () => {
  const { asUser } = await setup();
  const posts = Array.from({ length: 201 }, (_, i) => ({
    id: String(i + 1),
    reason: "ad" as const,
  }));
  await expect(asUser.mutation(api.stats.recordHidden, { posts })).rejects.toThrow(
    "Too many posts",
  );
});

test("myHidden is null signed out, otherwise newest first with reasons", async () => {
  const { t, asUser } = await setup();
  expect(await t.query(api.stats.myHidden)).toBeNull();
  await asUser.mutation(api.stats.recordHidden, { posts: [{ id: "1", reason: "ad" }] });
  await asUser.mutation(api.stats.recordHidden, { posts: [{ id: "2", reason: "slop" }] });
  const hidden = await asUser.query(api.stats.myHidden);
  expect(hidden?.map((h) => [h.url, h.reason])).toEqual([
    ["https://x.com/i/status/2", "slop"],
    ["https://x.com/i/status/1", "ad"],
  ]);
});
