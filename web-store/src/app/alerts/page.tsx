import type { Metadata } from 'next';
import { unstable_rethrow } from 'next/navigation';
import Link from '@/components/Link';
import { Swatch } from '@/components/VariantSelection';
import { formatShortStoreDate } from '@/lib/format';
import { requireSession, sessionRead } from '@/lib/page-session';
import type { ColorAlert, ProductAlert } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'تنبيهات التوفر', robots: { index: false } };

/**
 * «أعلمني عند توفره» — the products and colours this customer waits for. An
 * alert is sent once, as a notification, when the item is available again,
 * and then disappears from here. Alerts are cancelled on the product page.
 */
export default async function AlertsPage() {
  const returnTo = '/alerts';
  const session = await requireSession(returnTo);
  const [products, colors] = await Promise.all([
    sessionRead<ProductAlert[]>(session, '/restock-subscriptions/mine', returnTo),
    // An older API without colour alerts (088) answers 404: the page still lists product alerts.
    sessionRead<{ items: ColorAlert[] }>(session, '/restock-subscriptions/mine/variants', returnTo).catch((error: Error) => {
      // An expired session still goes to login.
      unstable_rethrow(error);
      console.error('[page] colour alerts failed:', error?.message);
      return null;
    }),
  ]);
  const colorItems = colors?.items ?? [];

  return (
    <div className="narrow stack">
      <h1>تنبيهات التوفر</h1>
      {colors === null ? <p className="alert alert-info">تعذّر تحميل تنبيهات الألوان الآن.</p> : null}
      {products.length === 0 && colorItems.length === 0 ? (
        <div className="card">
          <p>
            <strong>لا تنبيهات حالياً</strong>
          </p>
          <p className="hint">اضغط «أعلمني عند توفره» في صفحة منتجٍ نفد، ونرسل لك إشعاراً فور توفّره.</p>
        </div>
      ) : (
        <ul className="alert-list">
          {products.map((alert) => (
            <li key={alert.productId} className="card summary-row">
              <Link href={`/p/${alert.productId}`}>{alert.name}</Link>
              <span className="hint">
                {alert.inStock ? 'متوفر الآن' : alert.restockAt ? `بانتظار توفيره بتاريخ ${formatShortStoreDate(alert.restockAt)}` : 'بانتظار التوفر'}
              </span>
            </li>
          ))}
          {colorItems.map((alert) => (
            <li key={alert.variantId} className="card summary-row">
              <Link href={`/p/${alert.productId}`}>
                {alert.nameAr} — <Swatch hex={alert.colorHex} />
                {alert.colorNameAr}
              </Link>
              <span className="hint">{alert.inStock ? 'متوفر الآن' : 'بانتظار التوفر'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
