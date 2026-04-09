import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("hashPassword", () => {
  it("returns a bcrypt hash", async () => {
    const hash = await hashPassword("test123");
    expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt prefix
    expect(hash.length).toBeGreaterThan(50);
  });

  it("produces different hashes for same input (salted)", async () => {
    const hash1 = await hashPassword("test123");
    const hash2 = await hashPassword("test123");
    expect(hash1).not.toBe(hash2);
  });
});

describe("verifyPassword", () => {
  it("verifies bcrypt password correctly", async () => {
    const hash = await hashPassword("mypassword");
    expect(await verifyPassword("mypassword", hash)).toBe(true);
    expect(await verifyPassword("wrongpassword", hash)).toBe(false);
  });

  it("verifies legacy SHA256 password", async () => {
    // SHA256 of "test123"
    const { createHash } = await import("node:crypto");
    const sha = createHash("sha256").update("test123").digest("hex");
    expect(await verifyPassword("test123", sha)).toBe(true);
    expect(await verifyPassword("wrong", sha)).toBe(false);
  });

  it("rejects empty hash", async () => {
    expect(await verifyPassword("test", "")).toBe(false);
  });
});
