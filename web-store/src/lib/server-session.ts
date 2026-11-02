import { cookies } from 'next/headers';
import { secureCookies, sessionSealKeys } from './config';
import { cookieName, seal, unseal, type SessionData } from './session';

/** The current visitor's session (server components and route handlers). */
export async function readSession(): Promise<SessionData | null> {
  const store = await cookies();
  return unseal(store.get(cookieName(secureCookies()))?.value, sessionSealKeys());
}

/**
 * Starts a NEW session. Called only after a successful upstream login; any
 * cookie the browser arrived with is replaced, never upgraded (no session
 * fixation).
 */
export async function writeSession(data: SessionData): Promise<void> {
  const store = await cookies();
  const maxAge = Math.max(0, Math.floor(data.exp - Date.now() / 1000));
  store.set(cookieName(secureCookies()), seal(data, sessionSealKeys()), {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.set(cookieName(secureCookies()), '', {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
