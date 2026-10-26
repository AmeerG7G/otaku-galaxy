import { NextResponse } from 'next/server';
import { ApiError } from './api';
import { siteOrigin } from './config';
import { isMutating, isSameOriginRequest } from './security';
import { clearSession, readSession } from './server-session';
import type { SessionData } from './session';

/**
 * The single wrapper every `/bff/*` route handler goes through.
 *
 * - Mutating methods must come from this site's origin (CSRF guard).
 * - `auth: true` routes need a live session; the bearer token is attached
 *   server-side and never leaves the server.
 * - API errors pass through with the API's own code and Arabic message, so
 *   the website and the app show the same thing for the same failure.
 * - An upstream 401 (expired/revoked token) or a suspended account ends the
 *   browser session too.
 */
export type BffBody = { data?: unknown; message?: string | null; error?: { code: string; message: string; details?: unknown } };

export function bffJson(status: number, body: BffBody, headers?: HeadersInit): NextResponse<BffBody> {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...(headers ?? {}) },
  });
}

export function bffError(status: number, code: string, message: string): NextResponse<BffBody> {
  return bffJson(status, { error: { code, message } });
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function handleBff(
  request: Request,
  options: { auth: boolean },
  run: (context: { session: SessionData | null }) => Promise<NextResponse<BffBody>>,
): Promise<NextResponse<BffBody>> {
  if (isMutating(request.method) && !isSameOriginRequest(request.headers, siteOrigin())) {
    return bffError(403, 'CROSS_ORIGIN_REJECTED', 'طلبٌ مرفوض من مصدرٍ غير الموقع');
  }

  const session = await readSession();
  if (options.auth && !session) {
    return bffError(401, 'LOGIN_REQUIRED', 'سجّل الدخول أولاً');
  }

  try {
    return await run({ session });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401 || error.code === 'ACCOUNT_SUSPENDED') await clearSession();
      return bffJson(error.status, { error: { code: error.code, message: error.message, details: error.details } });
    }
    // No request body, headers or token in the log — only what failed.
    console.error(`[bff] ${request.method} ${new URL(request.url).pathname} failed:`, (error as Error)?.message);
    return bffError(500, 'INTERNAL_ERROR', 'حدث خطأ غير متوقع');
  }
}
