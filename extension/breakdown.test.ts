import { expect, test } from "vite-plus/test";
import { lastDays } from "./breakdown";

test("lastDays bounds the last 7 local days, ending with today", () => {
  const now = new Date(2026, 10, 13, 15, 30).getTime();
  const { starts, labels } = lastDays(now);
  expect(starts).toHaveLength(8);
  expect(starts[0]).toBe(new Date(2026, 10, 7).getTime());
  expect(starts[6]).toBe(new Date(2026, 10, 13).getTime());
  expect(starts[7]).toBe(new Date(2026, 10, 14).getTime());
  expect(labels).toHaveLength(7);
  expect(labels[6]).toBe("Today");
});
