import type { Metadata } from 'next';
import Link from '@/components/Link';
import { MarkAllReadButton, MarkReadButton } from '@/components/AccountForms';
import { formatDateTime } from '@/lib/format';
import { notificationHref } from '@/lib/notifications';
import { requireSession, sessionRead } from '@/lib/page-session';
import type { AppNotification } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'الإشعارات', robots: { index: false } };

/**
 * The in-site inbox (D2): the notifications the API stores for this customer —
 * orders, reviews, restock, rewards — exactly what the app lists. Browser push
 * is not part of the website.
 */
export default async function NotificationsPage() {
  const returnTo = '/notifications';
  const session = await requireSession(returnTo);
  const { items, unread } = await sessionRead<{ items: AppNotification[]; unread: number }>(session, '/notifications', returnTo);

  return (
    <div className="narrow stack">
      <div className="section-head">
        <h1>الإشعارات</h1>
        {unread > 0 ? <MarkAllReadButton /> : null}
      </div>
      {unread > 0 ? <p className="hint">{unread.toLocaleString('ar-IQ')} غير مقروء</p> : null}
      {items.length === 0 ? (
        <div className="card">
          <p>
            <strong>لا توجد إشعارات</strong>
          </p>
          <p className="hint">ستظهر هنا تحديثات طلباتك وتقييماتك فور حدوثها.</p>
        </div>
      ) : (
        <ul className="notification-list">
          {items.map((notification) => {
            const href = notificationHref(notification);
            return (
              <li key={notification.id} className={`card notification${notification.read ? '' : ' notification--unread'}`}>
                <div className="summary-row">
                  <strong>
                    {notification.read ? null : <span className="visually-hidden">غير مقروء: </span>}
                    {notification.title}
                  </strong>
                  <time className="hint" dateTime={notification.createdAt}>
                    {formatDateTime(notification.createdAt)}
                  </time>
                </div>
                {notification.body ? <p>{notification.body}</p> : null}
                <div className="row">
                  {href ? <Link href={href}>عرض</Link> : null}
                  {notification.read ? null : <MarkReadButton id={notification.id} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
