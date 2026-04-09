import bcrypt from "bcryptjs";

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain, hash) {
  // Support legacy SHA256 hashes (64-char hex string) during migration
  if (/^[a-f0-9]{64}$/.test(hash)) {
    const { createHash } = await import("node:crypto");
    const sha = createHash("sha256").update(plain).digest("hex");
    return sha === hash;
  }
  return bcrypt.compare(plain, hash);
}
