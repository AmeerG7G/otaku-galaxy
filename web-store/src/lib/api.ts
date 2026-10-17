import { headers as requestHeaders } from 'next/headers';
import { clientIpFromHeaders, signedClientIpHeaders } from './client-ip';
import { apiBaseUrl, bffSharedSecret } from './config';

/**
 * Server-side client for the existing Otaku Galaxy API.
 *
 * Every call runs on the storefront server. The browser never talks to the
 * API directly and never sees the bearer token: authenticated calls take the
 * token from the sealed session cookie (see `session.ts`).
 *
 * The API's envelope is `{ success, data, message, error: { code } }`. Errors
 * are surfaced as `ApiError` with the server's code and Arabic message, so
 * the website shows exactly what the mobile app shows.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface Envelope<T> {
  success: boolean;
  data: T;
  message: string | null;
  error?: { code?: string; details?: unknown };
}

export interface ApiRequest {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  idempotencyKey?: string | null;
  /** Seconds the response may be reused (public catalog only). */
  revalidate?: number;
  query?: Record<string, string | number | undefined | null>;
}

const TIMEOUT_MS = 10_000;

async function shopperIpHeaders(): Promise<Record<string, string>> {
  const secret = bffSharedSecret();
  if (!secret) return {};
  let ip: string | null = null;
  try {
    ip = clientIpFromHeaders(await requestHeaders());
  } catch {
    // Outside a request (build time): there is no shopper to identify.
    return {};
  }
  return ip ? signedClientIpHeaders(secret, ip) : {};
}

export async function apiFetch<T>(path: string, request: ApiRequest = {}): Promise<{ data: T; message: string | null; headers: Headers }> {
  const url = new URL(`${apiBaseUrl()}${path}`);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { Accept: 'application/json', 'Accept-Language': 'ar' };
  if (request.body !== undefined) headers['Content-Type'] = 'application/json';
  if (request.token) headers.Authorization = `Bearer ${request.token}`;
  if (request.idempotencyKey) headers['Idempotency-Key'] = request.idempotencyKey;

  // Personalised calls are never cached. Public catalog reads may be reused
  // for a short window (they carry no Authorization header).
  const cacheable = !request.token && (request.method ?? 'GET') === 'GET' && request.revalidate !== undefined;
  const cacheOptions: RequestInit & { next?: { revalidate: number } } = cacheable
    ? { next: { revalidate: request.revalidate! } }
    : { cache: 'no-store' };

  // Uncached calls act for one shopper, so they carry that shopper's signed
  // IP (see `client-ip.ts`). Cached catalog reads are shared between visitors
  // and must never carry one visitor's identity.
  if (!cacheable) Object.assign(headers, await shopperIpHeaders());

  let response: Response;
  try {
    response = await fetch(url, {
      method: request.method ?? 'GET',
      headers,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...cacheOptions,
    });
  } catch {
    throw new ApiError(503, 'UPSTREAM_UNAVAILABLE', 'تعذّر الاتصال بالخادم — حاول بعد قليل');
  }

  let envelope: Envelope<T> | null = null;
  if (response.status !== 204) {
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch {
      envelope = null;
    }
  }

  if (!response.ok || !envelope || envelope.success === false) {
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? 'UPSTREAM_ERROR',
      envelope?.message ?? 'حدث خطأ غير متوقع',
      envelope?.error?.details,
    );
  }
  return { data: envelope.data, message: envelope.message, headers: response.headers };
}
