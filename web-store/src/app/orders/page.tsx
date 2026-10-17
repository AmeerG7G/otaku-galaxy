import type { Metadata } from 'next';
import Link from 'next/link';
import { Pagination, parsePage } from '@/components/Catalog';
import { formatDateTime, formatIqd, orderStatusLabel } from '@/lib/format';
import { requireSession, sessionRead } from '@/lib/page-session';
import type { OrderPage } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'طلباتي', robots: { index: false } };

const PAGE_SIZE = 10;

type Props = { searchParams: Promise<{ page?: string | string[] }> };

export default async function OrdersPage({ searchParams }: Props) {
  const page = parsePage((await searchParams).page);
  const returnTo = page > 1 ? `/orders?page=${page}` : '/orders';
  const session = await requireSession(returnTo);
  const orders = await sessionRead<OrderPage>(session, '/orders', returnTo, { query: { page, limit: PAGE_SIZE } });

  return (
    <>
      <h1>طلباتي</h1>
      {orders.items.length === 0 ? (
        <div className="empty card">
          <p>{page > 1 ? 'لا طلبات في هذه الصفحة.' : 'ما عندك طلبات بعد.'}</p>
          <Link className="btn btn-primary" href="/">
            تصفّح المنتجات
          </Link>
        </div>
      ) : (
        <ul className="order-list">
          {orders.items.map((order) => (
            <li key={order.id}>
              <Link className="order-link card" href={`/orders/${order.id}`}>
                <div className="summary-row">
                  <strong>طلب رقم {order.number}</strong>
                  <span className={`pill pill-status pill-status--${order.status.toLowerCase()}`}>{orderStatusLabel(order.status)}</span>
                </div>
                <div className="summary-row hint">
                  <span>{formatDateTime(order.createdAt)}</span>
                  <span>
                    {order.items.reduce((sum, item) => sum + item.quantity, 0)} قطعة · {formatIqd(order.total)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} hasMore={orders.hasMore} basePath="/orders" />
    </>
  );
}
