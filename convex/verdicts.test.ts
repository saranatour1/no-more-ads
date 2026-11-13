// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vite-plus/test";
import { internal } from "./_generated/api";
import schema from "./schema";
import { verdictKey } from "./verdicts";

const modules = import.meta.glob("./**/*.ts");

test("verdictKey depends on the text and the video flag", async () => {
  const key = await verdictKey("hello", false);
  expect(await verdictKey("hello", false)).toBe(key);
  expect(await verdictKey("hello!", false)).not.toBe(key);
  expect(await verdictKey("hello", true)).not.toBe(key);
});

test("lookup on unknown keys returns nothing", async () => {
  const t = convexTest(schema, modules);
  expect(await t.query(internal.verdicts.lookup, { keys: ["x", "y"] })).toEqual([]);
});

test("lookup returns exactly the saved verdicts", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.verdicts.save, {
    verdicts: [
      { key: "a", reason: "ad" },
      { key: "b", reason: "none" },
    ],
  });
  const found = await t.query(internal.verdicts.lookup, { keys: ["a", "b", "c"] });
  expect(found).toEqual([
    { key: "a", reason: "ad" },
    { key: "b", reason: "none" },
  ]);
});

test("saving an existing key keeps the first verdict", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.verdicts.save, { verdicts: [{ key: "a", reason: "ad" }] });
  await t.mutation(internal.verdicts.save, { verdicts: [{ key: "a", reason: "slop" }] });
  const rows = await t.run((ctx) => ctx.db.query("verdicts").collect());
  expect(rows.map((r) => r.reason)).toEqual(["ad"]);
});
