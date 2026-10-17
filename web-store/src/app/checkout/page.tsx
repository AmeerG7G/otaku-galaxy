import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckoutForm } from '@/components/CheckoutForm';
import { listGovernorates } from '@/lib/catalog';
import { localPhone } from '@/lib/format';
import { requireSession, sessionRead } from '@/lib/page-session';
import type { Cart } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'الدفع', robots: { index: false } };

export default async function CheckoutPage() {
  const session = await requireSession('/checkout');
  const [cart, governorates] = await Promise.all([sessionRead<Cart>(session, '/cart', '/checkout'), listGovernorates()]);

  if (cart.items.length === 0) {
    return (
      <div className="empty card narrow">
        <h1>الدفع</h1>
        <p>سلتك فارغة.</p>
        <Link className="btn btn-primary" href="/">
          تصفّح المنتجات
        </Link>
      </div>
    );
  }

  // The unit prices the customer saw, per product — the API rejects the
  // submit with PRODUCT_PRICE_CHANGED if any moved in the meantime.
  const expectedPrices = [...new Map(cart.items.map((line) => [line.productId, line.unitPrice])).entries()].map(
    ([productId, unitPrice]) => ({ productId, unitPrice }),
  );

  return (
    <>
      <h1>الدفع</h1>
      <CheckoutForm
        governorates={governorates}
        expectedPrices={expectedPrices}
        productNames={Object.fromEntries(cart.items.map((line) => [line.productId, line.productName]))}
        defaultPhone={localPhone(session.user.phone)}
        idempotencyKey={randomUUID()}
      />
    </>
  );
}
