import type { Response } from 'express';
import { ACCESS_TOKEN_TTL_SECONDS } from './jwt';

export const ACCESS_COOKIE = 'cogent_access';
export const REFRESH_COOKIE = 'cogent_refresh';

/**
 * ADR-0001 §1b/§1c assume web and API share a site (dev: both `localhost`).
 * A real split-host deploy (Vercel + a separate API host) is genuinely
 * cross-*site*, and `SameSite=Lax`/`Strict` cookies are not attached to
 * cross-site requests at all — login would 200 with `Set-Cookie` and the
 * browser would silently never store/send it. `COGENT_CROSS_SITE_COOKIES`
 * is the one env-gated toggle that flips both cookies to
 * `SameSite=None; Secure` for that topology; nowhere else decides this.
 */
function crossSiteCookies(): boolean {
  return process.env.COGENT_CROSS_SITE_COOKIES === 'true';
}

function secureFlag(): boolean {
  return process.env.NODE_ENV === 'production' || crossSiteCookies();
}

function sameSitePolicy(sameSite: 'lax' | 'strict'): 'lax' | 'strict' | 'none' {
  return crossSiteCookies() ? 'none' : sameSite;
}

export function setAccessCookie(res: Response, token: string): void {
  res.cookie(ACCESS_COOKIE, token, {
    httpOnly: true,
    secure: secureFlag(),
    sameSite: sameSitePolicy('lax'),
    path: '/',
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
}

/**
 * `Path=/api/auth` + `SameSite=Strict`: this cookie is never needed outside
 * the auth routes, so it is never sent outside them, and it is only ever
 * read by same-site XHR from an already-loaded page (ADR-0001 §1c). Under
 * `COGENT_CROSS_SITE_COOKIES`, "same-site XHR" is no longer true — the
 * refresh call is a cross-site fetch even though it's same-origin-initiated
 * by the page's own JS — so this cookie needs the same `None` override.
 */
export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: secureFlag(),
    sameSite: sameSitePolicy('strict'),
    path: '/api/auth',
    expires: expiresAt,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}
