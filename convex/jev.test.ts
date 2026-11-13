// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vite-plus/test";
import { api } from "./_generated/api";
import schema from "./schema";

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

test("zero posts resolves to an empty list", async () => {
  const { asUser } = await setup();
  expect(await asUser.action(api.jev.judgePosts, { posts: [] })).toEqual([]);
});
