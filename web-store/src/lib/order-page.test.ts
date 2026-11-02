import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';

/** Another customer's order (403 from the API) must look exactly like a missing one. */

const state = vi.hoisted(() => ({ error: null as unknown }));

vi.mock('@/lib/page-session', () => ({
  requireSession: async () => ({ token: 'jwt', exp: 4_000_000_000, user: { id: 'u', username: 'x', phone: '07700000000' } }),
  sessionRead: async () => {
    throw state.error;
  },
}));

const { default: OrderPage } = await import('@/app/orders/[id]/page');

const render = (id: string) => OrderPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });
const notFoundDigest = async (promise: Promise<unknown>) =>
  promise.then(
    () => 'rendered',
    (error: { digest?: string }) => error.digest ?? String(error),
  );

describe('order detail page', () => {
  const id = '6a1f0e76-7d4c-4a54-9f86-0d6a2f1e9b10';

  it('answers not-found for a missing order and for someone else’s', async () => {
    for (const status of [404, 403]) {
      state.error = new ApiError(status, status === 403 ? 'FORBIDDEN' : 'NOT_FOUND', 'x');
      expect(await notFoundDigest(render(id)), String(status)).toMatch(/^NEXT_HTTP_ERROR_FALLBACK;404/);
    }
  });

  it('still surfaces other failures to the error page', async () => {
    state.error = new ApiError(503, 'UPSTREAM_UNAVAILABLE', 'x');
    expect(await notFoundDigest(render(id))).not.toMatch(/NEXT_HTTP_ERROR_FALLBACK/);
  });
});
