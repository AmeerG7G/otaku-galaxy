import type { Metadata } from 'next';
import Link from '@/components/Link';
import { notFound } from 'next/navigation';
import { ConfirmReceiptButton } from '@/components/ConfirmReceiptButton';
import { Swatch } from '@/components/VariantSelection';
import { ApiError } from '@/lib/api';
import { isUuid } from '@/lib/catalog';
import { mediaOrigin } from '@/lib/config';
import { formatDateTime, formatIqd, localPhone, orderStatusLabel } from '@/lib/format';
import { resolveMediaUrl } from '@/lib/media';
import { requireSession, sessionRead } from '@/lib/page-session';
import type { Order } from '@/lib/types';
import { lineColorName } from '@/lib/variants';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'تفاصيل الطلب', robots: { index: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string }> };

export default async function OrderPage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const returnTo = `/orders/${id}`;
  const session = await requireSession(returnTo);

  let order: Order;
  try {
    order = await sessionRead<Order>(session, `/orders/${id}`, returnTo);
  } catch (error) {
    // Someone else's order (the API answers 403) looks exactly like a missing one.
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) notFound();
    throw error;
  }
  const placed = (await searchParams).placed === '1';
  const origin = mediaOrigin();

  return (
    <>
      {placed ? (
        <p className="alert alert-success" role="status">
          تم استلام طلبك — ستتواصل معك الإدارة لتأكيده. الدفع عند الاستلام.
        </p>
      ) : null}
      <div className="section-head">
        <h1>طلب رقم {order.number}</h1>
        <span className={`pill pill-status pill-status--${order.status.toLowerCase()}`}>{orderStatusLabel(order.status)}</span>
      </div>
      <p className="hint">{formatDateTime(order.createdAt)}</p>

      {order.status === 'REJECTED' && order.rejectionReason ? (
        <p className="alert alert-error">سبب الرفض: {order.rejectionReason}</p>
      ) : null}
      {order.status === 'OUT_FOR_DELIVERY' ? <ConfirmReceiptButton orderId={order.id} /> : null}

      <div className="two-col">
        <section aria-label="منتجات الطلب">
          <ul className="cart-lines">
            {order.items.map((item, index) => {
              const image = resolveMediaUrl(item.imageUrl, origin);
              return (
                <li key={`${item.productId ?? 'gone'}:${item.variantId ?? ''}:${item.optionValue ?? ''}:${index}`} className="card cart-line">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- API media origin
                    <img src={image} alt="" width={72} height={72} loading="lazy" />
                  ) : (
                    <span className="cart-line__placeholder" aria-hidden="true" />
                  )}
                  <div>
                    {item.productId ? (
                      <Link href={`/p/${item.productId}`}>
                        <strong>{item.productName}</strong>
                      </Link>
                    ) : (
                      <strong>{item.productName}</strong>
                    )}
                    {lineColorName(item) ? (
                      // The colour as it was at order time — the image is that colour's snapshot.
                      <div className="hint line-color">
                        <Swatch hex={item.variantColorHex} />
                        اللون: {lineColorName(item)}
                      </div>
                    ) : null}
                    {item.optionValue ? <div className="hint">{item.optionValue}</div> : null}
                    <div className="hint">
                      {formatIqd(item.price)} × {item.quantity}
                      {item.lineTotal < item.price * item.quantity ? <span className="pill pill-promo">عرض قطعتين</span> : null}
                    </div>
                    <div className="price">{formatIqd(item.lineTotal)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="stack">
          <section className="card summary" aria-label="المبالغ">
            <div className="summary-row">
              <span>مجموع المنتجات</span>
              <span>{formatIqd(order.productsTotal)}</span>
            </div>
            {order.discount > 0 ? (
              <div className="summary-row">
                <span>الخصم</span>
                <span>−{formatIqd(order.discount)}</span>
              </div>
            ) : null}
            <div className="summary-row">
              <span>رسوم التوصيل</span>
              <span>{formatIqd(order.deliveryFee)}</span>
            </div>
            {order.deliveryDiscount > 0 ? (
              <div className="summary-row">
                <span>خصم التوصيل</span>
                <span>−{formatIqd(order.deliveryDiscount)}</span>
              </div>
            ) : null}
            <div className="summary-row summary-row--total">
              <span>الإجمالي (عند الاستلام)</span>
              <span>{formatIqd(order.total)}</span>
            </div>
          </section>

          <section className="card" aria-label="التوصيل">
            <h2>التوصيل</h2>
            <p>
              {order.province}
              {order.zoneName ? ` — ${order.zoneName}` : ''}
            </p>
            <p className="address">{order.fullAddress}</p>
            <p className="ltr">{localPhone(order.phone)}</p>
            {order.deliveryNote ? <p className="hint">ملاحظة: {order.deliveryNote}</p> : null}
          </section>

          {order.statusHistory.length > 0 ? (
            <section className="card" aria-label="مراحل الطلب">
              <h2>مراحل الطلب</h2>
              <ol className="timeline">
                {order.statusHistory.map((event, index) => (
                  <li key={`${event.status}:${event.createdAt}:${index}`}>
                    <strong>{orderStatusLabel(event.status)}</strong>
                    <div className="hint">{formatDateTime(event.createdAt)}</div>
                    {event.note ? <div className="hint">{event.note}</div> : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </aside>
      </div>

      <p>
        <Link href="/orders">كل طلباتي</Link>
      </p>
    </>
  );
}
