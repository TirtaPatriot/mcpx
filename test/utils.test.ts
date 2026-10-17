import { describe, expect, test } from "bun:test";
import { esc, hashPassword, preview, safeDecode, safeEqual, safePath, verifyPassword } from "../src/utils";

describe("password hashing", () => {
  test("verifyPassword accepts the right password and rejects others", () => {
    const hash = hashPassword("s3cret");
    expect(verifyPassword("s3cret", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
  });
});

describe("safeEqual", () => {
  test("compares strings of different length without throwing", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("safePath", () => {
  test("redacts sensitive query params and keeps the rest", () => {
    const out = safePath(new URL("http://x/oauth/token?code=abc&state=keep&client_secret=zzz"));
    expect(out).toContain("code=REDACTED");
    expect(out).toContain("client_secret=REDACTED");
    expect(out).toContain("state=keep");
    expect(out).not.toContain("abc");
    expect(out).not.toContain("zzz");
  });
});

describe("esc", () => {
  test("escapes HTML special characters", () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

describe("helpers", () => {
  test("safeDecode returns the input when it is not valid percent-encoding", () => {
    expect(safeDecode("a%20b")).toBe("a b");
    expect(safeDecode("%E0%A4%A")).toBe("%E0%A4%A");
  });

  test("preview truncates long text and flattens newlines", () => {
    expect(preview("a\nb")).toBe("a⏎b");
    expect(preview("x".repeat(10), 4)).toBe("xxxx…(+6)");
  });
});
