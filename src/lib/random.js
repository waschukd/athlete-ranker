// CSPRNG helpers for codes/passwords that gate account access (temp passwords,
// org/join/check-in codes). Math.random() is not cryptographically secure --
// its output is predictable enough to brute-force given a few samples, which
// matters here because every caller uses this for something an attacker could
// otherwise guess their way into.
import crypto from "node:crypto";

const UPPER_ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER_ALNUM = "0123456789abcdefghijklmnopqrstuvwxyz";

export function randomCode(length, alphabet = UPPER_ALNUM) {
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[crypto.randomInt(0, alphabet.length)];
  return out;
}

// 6-char uppercase alphanumeric -- org codes, join codes, tester/evaluator IDs.
export function randomOrgCode() {
  return randomCode(6, UPPER_ALNUM);
}

// Matches the old Math.random().toString(36)-based temp passwords: 8 lowercase
// alphanumeric chars + a fixed suffix guaranteeing upper/digit/symbol so it
// always clears password-complexity checks.
export function randomTempPassword() {
  return randomCode(8, LOWER_ALNUM) + "A1!";
}
