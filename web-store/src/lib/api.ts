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

  // Every call acts for one shopper and carries that shopper's signed IP
  // (see `client-ip.ts`), so the API's rate limits stay per shopper. Nothing is
  // cached, catalog reads included. A shared cached read cannot carry one
  // visitor's identity, so it would reach the API as this server's own
  // address: one rate-limit bucket that any visitor can drain with cache misses
  // (a random search, an unknown product id), after which every other
  // shopper's misses fail. Shopper-chosen keys would also grow the on-disk
  // fetch cache without bound. The API sits on the same host or a private
  // network, so the cost of not caching is a few milliseconds per page.
  Object.assign(headers, await shopperIpHeaders());

  let response: Response;
  try {
    response = await fetch(url, {
      method: request.method ?? 'GET',
      headers,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
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
