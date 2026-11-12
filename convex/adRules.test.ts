import { expect, test } from "vite-plus/test";
import { type Answers, isAd, isSlop } from "./adRules";

const answers = (given: Partial<Answers>): Answers => ({
  sells: 0.1,
  call_to_action: 0.1,
  paid_partnership: 0.1,
  stock_hook: 0.1,
  generic_content: 0.1,
  ...given,
});

test("isAd needs a disclosure, or both selling and a push to act", () => {
  expect(isAd(answers({ paid_partnership: 0.9 }))).toBe(true);
  expect(isAd(answers({ sells: 0.9, call_to_action: 0.9 }))).toBe(true);
  // Praising a product without pushing it, and unsettled answers, are not ads.
  expect(isAd(answers({ sells: 0.9, call_to_action: 0.2 }))).toBe(false);
  expect(isAd(answers({ sells: 0.6, call_to_action: 0.6, paid_partnership: 0.6 }))).toBe(false);
  // A selling post with a video is a promotional video; a plain video is not.
  expect(isAd(answers({ sells: 0.9 }), true)).toBe(true);
  expect(isAd(answers({ sells: 0.2 }), true)).toBe(false);
});

test("isSlop needs both a stock hook and generic content", () => {
  expect(isSlop(answers({ stock_hook: 0.9, generic_content: 0.9 }))).toBe(true);
  expect(isSlop(answers({ stock_hook: 0.9 }))).toBe(false);
  expect(isSlop(answers({ generic_content: 0.9 }))).toBe(false);
});
