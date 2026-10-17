'use client';

/**
 * Browser → BFF calls. Same-origin only; the session cookie rides along and
 * the BFF attaches the bearer token server-side. The API's Arabic error
 * message and code come back unchanged.
 */
export interface BffResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  message?: string | null;
  error?: { code: string; message: string; details?: unknown };
  replayed?: boolean;
}

export async function bff<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<BffResult<T>> {
  try {
    const response = await fetch(path, {
      method: init.method ?? 'GET',
      headers: init.body === undefined ? { Accept: 'application/json' } : { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const json = (await response.json().catch(() => ({}))) as Omit<BffResult<T>, 'ok' | 'status'>;
    return { ok: response.ok, status: response.status, replayed: response.headers.get('idempotency-replayed') === 'true', ...json };
  } catch {
    return { ok: false, status: 0, error: { code: 'NETWORK_ERROR', message: 'تعذّر الاتصال — تحقّق من الشبكة ثم أعد المحاولة' } };
  }
}
