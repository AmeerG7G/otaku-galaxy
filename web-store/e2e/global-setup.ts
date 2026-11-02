import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * A real customer for the run, created the way every customer is: an account
 * request through the API, approved by an admin. No mock data and no direct
 * database writes. Runs only against a local dev API.
 */
export const STATE_FILE = path.join(process.cwd(), 'e2e', '.state', 'customer.json');

export interface E2eState {
  phone: string;
  password: string;
  productId: string;
  governorateId: string;
  apiUrl: string;
}

async function call<T>(apiUrl: string, route: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const response = await fetch(`${apiUrl}${route}`, {
    method: init.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = (await response.json()) as { data: T; message?: string };
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${route} → ${response.status}: ${json.message ?? ''}`);
  return json.data;
}

export default async function globalSetup() {
  const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:4000/api';
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(apiUrl)) {
    throw new Error('E2E_API_URL must point at a local development API.');
  }
  const adminPhone = process.env.SEED_ADMIN_PHONE;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPhone || !adminPassword) throw new Error('SEED_ADMIN_PHONE / SEED_ADMIN_PASSWORD are required for e2e setup.');

  const admin = await call<{ token: string }>(apiUrl, '/auth/login', { method: 'POST', body: { phone: adminPhone, password: adminPassword } });
  const phone = `0772${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
  const password = `e2e-${Math.random().toString(36).slice(2, 12)}`;
  const registered = await call<{ request: { id: string } }>(apiUrl, '/auth/register', {
    method: 'POST',
    body: { username: 'زبون اختبار الموقع', phone, password, gender: 'female' },
  });
  await call(apiUrl, `/admin/account-requests/${registered.request.id}/approve`, { method: 'POST', token: admin.token });

  // The list omits options; only the product detail carries them.
  const products = await call<{ items: Array<{ id: string; stock: number }> }>(apiUrl, '/catalog/products?limit=50');
  let product: { id: string } | null = null;
  for (const candidate of products.items.filter((item) => item.stock >= 5)) {
    const detail = await call<{ options?: unknown[] }>(apiUrl, `/catalog/products/${candidate.id}`);
    if ((detail.options ?? []).length === 0) {
      product = candidate;
      break;
    }
  }
  if (!product) throw new Error('The dev seed has no in-stock product without options.');

  const governorates = await call<{ items: Array<{ id: string }> }>(apiUrl, '/catalog/governorates');
  let governorateId: string | null = null;
  for (const governorate of governorates.items) {
    const zones = await call<{ items: unknown[] }>(apiUrl, `/catalog/governorates/${governorate.id}/zones`);
    if (zones.items.length === 0) {
      governorateId = governorate.id;
      break;
    }
  }
  if (!governorateId) throw new Error('The dev seed has no governorate without delivery zones.');

  const state: E2eState = { phone, password, productId: product.id, governorateId, apiUrl };
  mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state));
}
