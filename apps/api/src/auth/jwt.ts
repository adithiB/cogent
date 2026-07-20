import { SignJWT, jwtVerify, errors } from 'jose';
import type { Role } from '../db/scope';

/** ADR-0001 §1b: 15 minutes, because the access-token TTL *is* the blast
 * radius for the honest residual described in §1d — it is not a tuning knob. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export interface AccessTokenClaims {
  sub: string;
  org: string;
  role: Role;
}

function encodeSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** HS256, not RS256 — one issuer, one verifier, the same process. No key
 * distribution problem exists here to justify asymmetric signing (ADR-0001 §1b). */
export async function signAccessToken(claims: AccessTokenClaims, secret: string): Promise<string> {
  return new SignJWT({ org: claims.org, role: claims.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .setJti(crypto.randomUUID())
    .sign(encodeSecret(secret));
}

export class AccessTokenInvalidError extends Error {}

export async function verifyAccessToken(token: string, secret: string): Promise<AccessTokenClaims> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, encodeSecret(secret)));
  } catch (err) {
    if (err instanceof errors.JOSEError) {
      throw new AccessTokenInvalidError(err.message);
    }
    throw err;
  }

  const { sub, org, role } = payload;
  if (typeof sub !== 'string' || typeof org !== 'string' || (role !== 'owner' && role !== 'member')) {
    throw new AccessTokenInvalidError('Malformed access token claims');
  }
  return { sub, org, role };
}
