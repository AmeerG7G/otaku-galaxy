'use client';

import Link from '@/components/Link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatIqd, pairOfferLabel } from '@/lib/format';
import type { CartLine } from '@/lib/types';
import { bff } from './client-api';
import { useHydrated } from './use-hydrated';

/**
 * The server cart. Every change goes to the API and the page re-reads the
 * cart afterwards — the website never keeps its own copy of quantities.
 */
export function CartView({ lines }: { lines: CartLine[] }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busyLine, setBusyLine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function change(lineId: string, action: { quantity: number } | 'remove') {
    setBusyLine(lineId);
    setError(null);
    const result =
      action === 'remove'
        ? await bff(`/bff/cart/${lineId}`, { method: 'DELETE' })
        : await bff(`/bff/cart/${lineId}`, { method: 'PATCH', body: action });
    setBusyLine(null);
    if (!result.ok) setError(result.error?.message ?? 'تعذّر تحديث السلة');
    router.refresh();
  }

  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);

  return (
    <div className="two-col">
      <section aria-label="منتجات السلة">
        {error ? (
          <p className="alert alert-error" role="alert">
            {error}
          </p>
        ) : null}
        <ul className="cart-lines">
          {lines.map((line) => (
            <li key={line.id} className="card cart-line">
              {line.productImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- API media origin
                <img src={line.productImage} alt="" width={72} height={72} loading="lazy" />
              ) : (
                <span className="cart-line__placeholder" aria-hidden="true" />
              )}
              <div>
                <Link href={`/p/${line.productId}`}>
                  <strong>{line.productName}</strong>
                </Link>
                {line.optionValue ? <div className="hint">{line.optionValue}</div> : null}
                <div className="price">{formatIqd(line.unitPrice)}</div>
                {pairOfferLabel(line.pairPrice) ? <div className="hint">{pairOfferLabel(line.pairPrice)}</div> : null}
                {line.quantity > 1 || line.lineTotal !== line.unitPrice * line.quantity ? (
                  // The server's line total — after the two-piece offer across
                  // this product's lines, so it can be below price × quantity.
                  <div className="hint">
                    الإجمالي <span className="price">{formatIqd(line.lineTotal)}</span>
                    {line.lineTotal < line.unitPrice * line.quantity ? <span className="pill pill-promo">عرض قطعتين</span> : null}
                  </div>
                ) : null}
                <div className="cart-line__actions">
                  <div className="stepper" role="group" aria-label={`كمية ${line.productName}`}>
                    <button
                      type="button"
                      aria-label="إنقاص"
                      disabled={!hydrated || busyLine === line.id || line.quantity <= 1}
                      onClick={() => change(line.id, { quantity: line.quantity - 1 })}
                    >
                      −
                    </button>
                    <output>{line.quantity}</output>
                    <button
                      type="button"
                      aria-label="زيادة"
                      disabled={!hydrated || busyLine === line.id || line.quantity >= Math.min(line.stock, 100)}
                      onClick={() => change(line.id, { quantity: line.quantity + 1 })}
                    >
                      +
                    </button>
                  </div>
                  <button type="button" className="btn" disabled={!hydrated || busyLine === line.id} onClick={() => change(line.id, 'remove')}>
                    حذف
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <aside className="card summary" aria-label="ملخص السلة">
        <div className="summary-row">
          <span>مجموع المنتجات</span>
          <span className="price">{formatIqd(subtotal)}</span>
        </div>
        <p className="hint">رسوم التوصيل والخصومات تُحسب في صفحة الدفع حسب محافظتك.</p>
        <Link className="btn btn-primary btn-block" href="/checkout">
          متابعة إلى الدفع
        </Link>
      </aside>
    </div>
  );
}
