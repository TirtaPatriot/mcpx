import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { hardDenyReason } from "../src/env-policy";
import { buildProcessEnv } from "../src/stdio-manager";

const host = {
  ADMIN_PASSWORD: "hunter2",
  CLIENT_SECRET: "shh",
  AWS_SECRET_ACCESS_KEY: "aws",
  PATH: "/usr/bin",
  HOME: "/home/bun",
  LANG: "en_US.UTF-8",
  LC_ALL: "C",
  TZ: "UTC",
  HTTPS_PROXY: "http://proxy:3128",
  https_proxy: "http://proxy:3128",
  MY_HOST_VAR: "visible-only-if-passed-through",
  LD_PRELOAD: "/evil.so",
};

describe("buildProcessEnv", () => {
  test("keeps the harmless basics of the host environment", () => {
    const env = buildProcessEnv({ serverEnv: {}, host });
    for (const name of ["PATH", "HOME", "LANG", "LC_ALL", "TZ", "HTTPS_PROXY", "https_proxy"]) expect(env[name]).toBe(host[name as keyof typeof host]);
  });

  test("does not leak the gateway's secrets or anything else of the host", () => {
    const env = buildProcessEnv({ serverEnv: {}, host });
    for (const name of ["AWS_SECRET_ACCESS_KEY", "MY_HOST_VAR", "LD_PRELOAD"]) expect(env[name]).toBeUndefined();
    // The gateway's own settings are present but empty, which is what stops Bun filling them from a .env file.
    for (const name of ["ADMIN_PASSWORD", "CLIENT_SECRET"]) expect(env[name]).toBe("");
  });

  test("an empty gateway setting keeps Bun from loading it out of a .env file in the working directory", async () => {
    // Bun reads .env on its own at start-up, so a process run with `bun` or `bunx` in the gateway's
    // directory would otherwise see the gateway's ADMIN_PASSWORD even though the environment was scrubbed.
    const dir = mkdtempSync(join(tmpdir(), "mcpx-dotenv-"));
    writeFileSync(join(dir, ".env"), "ADMIN_PASSWORD=from-dotenv\nCLIENT_SECRET=from-dotenv\nOTHER=from-dotenv\n");
    const env = buildProcessEnv({ serverEnv: {}, host: { PATH: process.env.PATH, HOME: process.env.HOME } });
    const child = Bun.spawn(["bun", "-e", "console.log(JSON.stringify([process.env.ADMIN_PASSWORD, process.env.CLIENT_SECRET]))"], { cwd: dir, env, stdout: "pipe" });
    expect(JSON.parse((await new Response(child.stdout).text()).trim())).toEqual(["", ""]);
  });

  test("an admin who sets a gateway-setting name in env_vars on purpose gets exactly that", () => {
    expect(buildProcessEnv({ serverEnv: { PUBLIC_URL: "https://mine.example" }, host }).PUBLIC_URL).toBe("https://mine.example");
  });

  test("always sets the cache variables the tool runners need", () => {
    const env = buildProcessEnv({ serverEnv: {}, host: {} });
    for (const name of ["UV_CACHE_DIR", "GOCACHE", "GOPATH", "BUN_INSTALL_CACHE_DIR", "npm_config_cache", "PYTHONUNBUFFERED"]) expect(env[name]).toBeString();
  });

  test("the server's own env_vars beat the base, and overrides beat env_vars", () => {
    const env = buildProcessEnv({ serverEnv: { LANG: "fr_FR.UTF-8", MODE: "server" }, overrides: { MODE: "override" }, host });
    expect(env.LANG).toBe("fr_FR.UTF-8");
    expect(env.MODE).toBe("override");
  });

  test("a host variable named in the passthrough list reaches the process", () => {
    expect(buildProcessEnv({ serverEnv: {}, host, passthrough: ["MY_HOST_VAR"] }).MY_HOST_VAR).toBe("visible-only-if-passed-through");
  });

  test("a passthrough list can carry a credential on purpose (it is the admin's choice)", () => {
    expect(buildProcessEnv({ serverEnv: {}, host, passthrough: ["AWS_SECRET_ACCESS_KEY"] }).AWS_SECRET_ACCESS_KEY).toBe("aws");
  });

  test("a passthrough list can never carry the gateway's own settings or a loader hook", () => {
    const env = buildProcessEnv({ serverEnv: {}, host, passthrough: ["ADMIN_PASSWORD", "CLIENT_SECRET", "LD_PRELOAD"] });
    expect(env.ADMIN_PASSWORD).toBe("");
    expect(env.CLIENT_SECRET).toBe("");
    expect(env.LD_PRELOAD).toBeUndefined();
  });

  test("an env_vars entry set by the admin is trusted, even for names that overrides could never touch", () => {
    expect(buildProcessEnv({ serverEnv: { NODE_OPTIONS: "--max-old-space-size=512" }, host }).NODE_OPTIONS).toBe("--max-old-space-size=512");
  });
});

describe("hardDenyReason", () => {
  test("covers the deny list but not the secret-looking names", () => {
    expect(hardDenyReason("PATH")).toBeString();
    expect(hardDenyReason("ADMIN_PASSWORD")).toBeString();
    expect(hardDenyReason("AWS_SECRET_ACCESS_KEY")).toBeNull();
    expect(hardDenyReason("MY_HOST_VAR")).toBeNull();
  });
});
