import type { Response } from 'express';
import { ACCESS_TOKEN_TTL_SECONDS } from './jwt';

export const ACCESS_COOKIE = 'cogent_access';
export const REFRESH_COOKIE = 'cogent_refresh';

/**
 * `Secure` is env-gated, never a code branch someone could ship wrong by
 * forgetting to flip — it reads `NODE_ENV` once, here, and nowhere else
 * decides it (ADR-0001 §1b).
 */
function secureFlag(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function setAccessCookie(res: Response, token: string): void {
  res.cookie(ACCESS_COOKIE, token, {
    httpOnly: true,
    secure: secureFlag(),
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
}

/**
 * `Path=/api/auth` + `SameSite=Strict`: this cookie is never needed outside
 * the auth routes, so it is never sent outside them, and it is only ever
 * read by same-site XHR from an already-loaded page (ADR-0001 §1c).
 */
export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: secureFlag(),
    sameSite: 'strict',
    path: '/api/auth',
    expires: expiresAt,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}
