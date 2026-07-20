import { Injectable, HttpException, HttpStatus } from '@nestjs/common';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const BASE_LOCKOUT_MS = 30 * 1000;
const MAX_LOCKOUT_MS = 15 * 60 * 1000;

interface Entry {
  failures: number;
  windowStartedAt: number;
  lockedUntil: number;
}

/**
 * Per-IP and per-account attempt counter with exponential backoff on
 * `/auth/login`. In-memory, single-process — fine for this deployment shape
 * (ADR-0001 amendment): argon2id's cost defends a stolen hash, not a live
 * brute-force loop against the endpoint, and those are different attacks.
 */
@Injectable()
export class LoginRateLimiterService {
  private readonly entries = new Map<string, Entry>();

  assertAllowed(...keys: string[]): void {
    const now = Date.now();
    for (const key of keys) {
      const entry = this.entries.get(key);
      if (entry && entry.lockedUntil > now) {
        const retryAfterSeconds = Math.ceil((entry.lockedUntil - now) / 1000);
        throw new HttpException(
          { message: 'Too many attempts. Try again shortly.', retryAfterSeconds },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  recordFailure(...keys: string[]): void {
    const now = Date.now();
    for (const key of keys) {
      let entry = this.entries.get(key);
      if (!entry || now - entry.windowStartedAt > WINDOW_MS) {
        entry = { failures: 0, windowStartedAt: now, lockedUntil: 0 };
      }
      entry.failures += 1;
      if (entry.failures >= MAX_ATTEMPTS) {
        const lockoutMs = Math.min(
          BASE_LOCKOUT_MS * 2 ** (entry.failures - MAX_ATTEMPTS),
          MAX_LOCKOUT_MS,
        );
        entry.lockedUntil = now + lockoutMs;
      }
      this.entries.set(key, entry);
    }
  }

  recordSuccess(...keys: string[]): void {
    for (const key of keys) {
      this.entries.delete(key);
    }
  }
}
