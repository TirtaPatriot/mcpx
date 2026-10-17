import { expect, test } from "bun:test";
import { getUserByUsername, seedInitialData } from "../src/db";
import { verifyPassword } from "../src/utils";

test("first start without ADMIN_PASSWORD creates a random admin password, and only once", () => {
  const first = seedInitialData();
  expect(first.defaultAdminCreated).toBe(true);
  expect(first.initialPassword).toBeString();
  expect(first.initialPassword).not.toBe("admin123");
  expect(first.initialPassword!.length).toBeGreaterThanOrEqual(12);

  const admin = getUserByUsername("admin");
  expect(admin).toBeTruthy();
  expect(verifyPassword(first.initialPassword!, admin!.password_hash)).toBe(true);
  expect(verifyPassword("admin123", admin!.password_hash)).toBe(false);

  const second = seedInitialData();
  expect(second.defaultAdminCreated).toBe(false);
  expect(second.initialPassword).toBeUndefined();
  expect(verifyPassword(first.initialPassword!, getUserByUsername("admin")!.password_hash)).toBe(true);
});
