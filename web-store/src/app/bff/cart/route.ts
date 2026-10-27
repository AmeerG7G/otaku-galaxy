import { apiFetch } from '@/lib/api';
import { bffJson, handleBff, readJsonBody } from '@/lib/bff';
import type { Cart } from '@/lib/types';
import { cartAddBody } from '@/lib/variants';

/** The server-side cart — the same cart the mobile app uses for this account. */
export async function GET(request: Request) {
  return handleBff(request, { auth: true }, async ({ session }) => {
    const { data } = await apiFetch<Cart>('/cart', { token: session!.token });
    return bffJson(200, { data });
  });
}

/** Add a product (the API validates stock, activity, colour and quantity bounds). */
export async function POST(request: Request) {
  return handleBff(request, { auth: true }, async ({ session }) => {
    const body = (await readJsonBody(request)) ?? {};
    const { data, message } = await apiFetch<unknown>('/cart', {
      method: 'POST',
      token: session!.token,
      // `variantId` = the chosen colour (STEP 74); `null` for a product without colours.
      body: cartAddBody(body),
    });
    return bffJson(200, { data, message });
  });
}
