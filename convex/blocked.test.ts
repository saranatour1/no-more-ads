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

test("signed out: list is null and add rejects", async () => {
  const { t } = await setup();
  expect(await t.query(api.blocked.list)).toBeNull();
  await expect(t.mutation(api.blocked.add, { term: "crypto" })).rejects.toThrow("Not signed in");
});

test("add trims, lower-cases and ignores duplicates", async () => {
  const { asUser } = await setup();
  await asUser.mutation(api.blocked.add, { term: "  Crypto " });
  await asUser.mutation(api.blocked.add, { term: "crypto" });
  expect(await asUser.query(api.blocked.list)).toEqual(["crypto"]);
});

test("a one-character term is rejected", async () => {
  const { asUser } = await setup();
  await expect(asUser.mutation(api.blocked.add, { term: "a" })).rejects.toThrow("Bad term");
});

test("remove deletes the term and is a no-op when absent", async () => {
  const { asUser } = await setup();
  await asUser.mutation(api.blocked.add, { term: "crypto" });
  await asUser.mutation(api.blocked.remove, { term: "crypto" });
  expect(await asUser.query(api.blocked.list)).toEqual([]);
  await asUser.mutation(api.blocked.remove, { term: "crypto" });
});

test("another user does not see the first user's terms", async () => {
  const { t, asUser } = await setup();
  await asUser.mutation(api.blocked.add, { term: "crypto" });
  const otherId = await t.run((ctx) => ctx.db.insert("users", {}));
  const asOther = t.withIdentity({ subject: otherId });
  expect(await asOther.query(api.blocked.list)).toEqual([]);
});
