import { hash, verify } from '@node-rs/argon2';

/**
 * OWASP-baseline argon2id params. Isolated behind these two functions per
 * ADR-0001 §1a — if `@node-rs/argon2`'s prebuilt binary ever fails in some
 * deployment target, the fallback (bcrypt) is a one-file change here, not a
 * refactor of every caller.
 *
 * `algorithm: 2` is `Algorithm.Argon2id` — the package types it as a
 * `const enum`, which `isolatedModules` (this project's build mode) cannot
 * reference directly, so the numeric value is used with the name pinned
 * in this comment.
 */
const ARGON2_OPTIONS = {
  algorithm: 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, ARGON2_OPTIONS);
}

export function verifyPassword(hashValue: string, plaintext: string): Promise<boolean> {
  return verify(hashValue, plaintext);
}
