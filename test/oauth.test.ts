import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { parseRedirectUri, verifyPkce } from "../src/oauth";

describe("parseRedirectUri", () => {
  test("accepts https redirects on whitelisted hosts and their subdomains", () => {
    expect(parseRedirectUri("https://claude.ai/api/mcp/auth_callback")).not.toBeNull();
    expect(parseRedirectUri("https://sub.chatgpt.com/cb")).not.toBeNull();
  });

  test("accepts loopback over http on any port (RFC 8252)", () => {
    expect(parseRedirectUri("http://localhost:54321/callback")).not.toBeNull();
    expect(parseRedirectUri("http://127.0.0.1:8080/cb")).not.toBeNull();
  });

  test("rejects plain http on non-loopback hosts", () => {
    expect(parseRedirectUri("http://claude.ai/cb")).toBeNull();
  });

  test("rejects hosts that are not whitelisted", () => {
    expect(parseRedirectUri("https://evil.example.org/cb")).toBeNull();
  });

  test("rejects look-alike hosts that merely end with a whitelisted name", () => {
    expect(parseRedirectUri("https://notclaude.ai/cb")).toBeNull();
  });

  test("rejects credentials embedded in the URL and non-URL input", () => {
    expect(parseRedirectUri("https://user:pw@claude.ai/cb")).toBeNull();
    expect(parseRedirectUri("not a url")).toBeNull();
  });

  test("honours per-client hosts and the wildcard", () => {
    expect(parseRedirectUri("https://app.example.org/cb", "https://app.example.org")).not.toBeNull();
    expect(parseRedirectUri("https://anything.example.net/cb", "*")).not.toBeNull();
  });
});

describe("verifyPkce", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  test("accepts the matching S256 verifier", () => {
    expect(verifyPkce(verifier, challenge)).toBe(true);
  });

  test("rejects a wrong or missing verifier", () => {
    expect(verifyPkce("wrong-verifier", challenge)).toBe(false);
    expect(verifyPkce(undefined, challenge)).toBe(false);
  });
});
