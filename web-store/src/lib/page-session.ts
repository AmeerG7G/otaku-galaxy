import { redirect } from 'next/navigation';
import { ApiError, apiFetch, type ApiRequest } from './api';
import { readSession } from './server-session';
import type { SessionData } from './session';

/** The session for a signed-in-only page; otherwise straight to login, coming back here after. */
export async function requireSession(returnTo: string): Promise<SessionData> {
  const session = await readSession();
  if (!session) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  return session;
}

/**
 * An authenticated API read from a server-rendered page.
 *
 * A page cannot change cookies while it renders, so when the API says the
 * token is no longer valid (expired, revoked by a password change, account
 * suspended) the visitor goes through `/bff/session/expired`, which drops the
 * cookie and sends them to login — instead of a page that keeps failing.
 */
export async function sessionRead<T>(
  session: SessionData,
  path: string,
  returnTo: string,
  request: Omit<ApiRequest, 'token' | 'method' | 'body'> = {},
): Promise<T> {
  try {
    return (await apiFetch<T>(path, { ...request, token: session.token })).data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.code === 'ACCOUNT_SUSPENDED')) {
      redirect(`/bff/session/expired?returnTo=${encodeURIComponent(returnTo)}`);
    }
    throw error;
  }
}
