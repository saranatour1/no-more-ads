import { expect, test } from "vite-plus/test";
import { parseHost, rulesFor } from "./rules";

test("rulesFor picks site rules by hostname", () => {
  expect(rulesFor("x.com").labelled?.labels).toContain("Ad");
  expect(rulesFor("mobile.twitter.com").labelled).toBeDefined();
  expect(rulesFor("www.google.co.uk").hide).toContain("#tads");
  expect(rulesFor("www.facebook.com").hide.some((s) => s.includes("Sponsored"))).toBe(true);
  // Lookalike hosts and unknown sites only get the generic rules.
  expect(rulesFor("notx.com").labelled).toBeUndefined();
  expect(rulesFor("example.com").hide).toEqual(rulesFor("notgoogle.dev").hide);
});

test("parseHost normalises input and rejects junk", () => {
  expect(parseHost(" https://www.Example.com/page?q=1 ")).toBe("example.com");
  expect(parseHost("news.ycombinator.com")).toBe("news.ycombinator.com");
  expect(parseHost("localhost")).toBeNull();
  expect(parseHost("not a site")).toBeNull();
  expect(parseHost("")).toBeNull();
});
