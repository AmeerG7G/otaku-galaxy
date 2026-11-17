import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * STEP 85 — the two registration paths and retry information on the web store.
 *
 * - `WHATSAPP_VERIFY_MODE=auto`: /register offers WhatsApp and "Continue without
 *   WhatsApp" side by side; the manual path is the same administrator-reviewed
 *   form (`RegisterForm`), reachable in one tap, with no personal data in the URL.
 * - `off`: /register is the request form, exactly as before.
 * - A 429 from the API keeps `retryAfterSeconds` through `apiFetch` and the BFF
 *   (body field + `Retry-After` header), so the page can say when to retry.
 */

const state = vi.hoisted(() => ({ enabled: false }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-real-ip': '203.0.113.50' }) }));
vi.mock('@/lib/server-session', () => ({ readSession: async () => null, clearSession: async () => {} }));
vi.mock('@/lib/whatsapp-signup', () => ({ whatsappSignupEnabled: async () => state.enabled }));
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect'); }, notFound: () => { throw new Error('notFound'); } }));
vi.mock('@/components/AuthForms', () => ({ RegisterForm: function RegisterForm() { return null; } }));
vi.mock('@/components/Link', () => ({ default: function Link() { return null; } }));

const { default: RegisterPage } = await import('@/app/register/page');
const { RegisterForm } = await import('@/components/AuthForms');
const { ApiError, apiFetch } = await import('./api');
const { handleBff } = await import('./bff');
const { formatWait } = await import('./wait');

/** Walks a server component's element tree: link targets, visible text, component types. */
function walk(node: ReactNode, out = { hrefs: [] as string[], text: [] as string[], types: [] as unknown[] }) {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.text.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) walk(child, out);
    return out;
  }
  const element = node as ReactElement<{ href?: string; children?: ReactNode }>;
  out.types.push(element.type);
  if (element.props?.href) out.hrefs.push(element.props.href);
  walk(element.props?.children, out);
  return out;
}

const render = async (method?: string) =>
  walk(await RegisterPage({ searchParams: Promise.resolve(method ? { method } : {}) }));

describe('/register — two paths', () => {
  it('auto: WhatsApp and "Continue without WhatsApp" are both offered before any form', async () => {
    state.enabled = true;
    const page = await render();
    expect(page.hrefs).toEqual(['/register/whatsapp', '/register?method=manual']);
    expect(page.text.join(' ')).toContain('المتابعة بدون واتساب');
    expect(page.text.join(' ')).toContain('يُرسَل الطلب إلى الإدارة');
    expect(page.types).not.toContain(RegisterForm);
  });

  it('auto + manual: the administrator-reviewed request form, with a way back to WhatsApp', async () => {
    state.enabled = true;
    const page = await render('manual');
    expect(page.types).toContain(RegisterForm);
    expect(page.hrefs).toEqual(['/register/whatsapp']);
    expect(page.text.join(' ')).toContain('يُفعَّل الحساب بعد مراجعته');
  });

  it('off: the request form only — exactly as before, whatever the URL says', async () => {
    state.enabled = false;
    for (const method of [undefined, 'manual']) {
      const element = await RegisterPage({ searchParams: Promise.resolve(method ? { method } : {}) });
      expect((element as ReactElement).type).toBe(RegisterForm);
    }
  });
});

describe('retry information', () => {
  beforeEach(() => {
    vi.stubEnv('BFF_SHARED_SECRET', 'test-secret-test-secret-test-secret-1234');
    vi.stubEnv('API_INTERNAL_URL', 'http://127.0.0.1:4000/api');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const upstream = (error: Record<string, unknown>) =>
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ success: false, data: null, message: 'طلبات كثيرة', error }), { status: 429 }),
    );

  it('apiFetch keeps error.retryAfterSeconds from a 429; absent stays undefined', async () => {
    upstream({ code: 'WHATSAPP_VERIFY_RATE_LIMITED', retryAfterSeconds: 61 });
    const limited = await apiFetch('/auth/register/whatsapp/start', { method: 'POST', body: {} }).catch((e: unknown) => e);
    expect(limited).toBeInstanceOf(ApiError);
    expect((limited as InstanceType<typeof ApiError>).retryAfterSeconds).toBe(61);

    upstream({ code: 'RATE_LIMITED' });
    const plain = await apiFetch('/auth/register/whatsapp/start', { method: 'POST', body: {} }).catch((e: unknown) => e);
    expect((plain as InstanceType<typeof ApiError>).retryAfterSeconds).toBeUndefined();
  });

  it('the BFF passes it on as a body field and a Retry-After header', async () => {
    const request = new Request('http://localhost/bff/register/whatsapp/start', { method: 'GET' });
    const response = await handleBff(request, { auth: false }, async () => {
      throw new ApiError(429, 'WHATSAPP_VERIFY_RATE_LIMITED', 'طلبات كثيرة', undefined, 125);
    });
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('125');
    expect((await response.json()).error).toMatchObject({ code: 'WHATSAPP_VERIFY_RATE_LIMITED', retryAfterSeconds: 125 });
  });

  it('formatWait: digits only', () => {
    expect(formatWait(0)).toBe('0:00');
    expect(formatWait(59)).toBe('0:59');
    expect(formatWait(125)).toBe('2:05');
    expect(formatWait(3600)).toBe('1:00:00');
  });
});
