import type { Metadata } from 'next';
import Link from 'next/link';
import { CartView } from '@/components/CartView';
import { mediaOrigin } from '@/lib/config';
import { resolveMediaUrl } from '@/lib/media';
import { sessionRead } from '@/lib/page-session';
import { readSession } from '@/lib/server-session';
import type { Cart } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'السلة', robots: { index: false } };

export default async function CartPage() {
  const session = await readSession();
  if (!session) {
    return (
      <div className="empty card narrow">
        <h1>السلة</h1>
        <p>سجّل الدخول لعرض سلتك — السلة نفسها في التطبيق والموقع.</p>
        <Link className="btn btn-primary" href="/login?returnTo=%2Fcart">
          تسجيل الدخول
        </Link>
      </div>
    );
  }

  const cart = await sessionRead<Cart>(session, '/cart', '/cart');
  const origin = mediaOrigin();
  const lines = cart.items.map((line) => ({ ...line, productImage: resolveMediaUrl(line.productImage, origin) }));

  return (
    <>
      <h1>السلة</h1>
      {cart.adjustments.length > 0 ? (
        <p className="alert alert-info" role="status">
          عُدّلت سلتك لتطابق المخزون الحالي.
        </p>
      ) : null}
      {lines.length === 0 ? (
        <div className="empty card">
          <p>سلتك فارغة.</p>
          <Link className="btn btn-primary" href="/">
            تصفّح المنتجات
          </Link>
        </div>
      ) : (
        <CartView lines={lines} />
      )}
    </>
  );
}
