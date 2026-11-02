import type { Metadata } from 'next';
import Link from '@/components/Link';
import { BirthdayForm } from '@/components/AccountForms';
import { monthName } from '@/lib/birthday';
import { requireSession, sessionRead } from '@/lib/page-session';
import type { BirthdayStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'تاريخ الميلاد', robots: { index: false } };

/**
 * The birthday, as the API reports it: locked until the first received order,
 * set once by the customer, corrected only by the admin.
 */
export default async function BirthdayPage() {
  const returnTo = '/account/birthday';
  const session = await requireSession(returnTo);
  const status = await sessionRead<BirthdayStatus>(session, '/birthday', returnTo);
  const percent = status.discountPercent.toLocaleString('ar-IQ');

  return (
    <div className="narrow stack">
      <p>
        <Link href="/account">حسابي</Link>
      </p>
      <h1>🎂 تاريخ ميلادك</h1>
      <section className="card stack">
        {status.isBirthdayToday && status.rewardAvailable ? (
          <p className="alert alert-success" role="status">
            🎂 عيد ميلاد سعيد! لديك خصم {percent}٪ على طلبك اليوم — صالح حتى ١١:٥٩ مساءً.
          </p>
        ) : null}
        {status.hasBirthday && status.day && status.month ? (
          <>
            <p>
              تاريخ ميلادك المحفوظ: <strong>{status.day.toLocaleString('ar-IQ')} {monthName(status.month)}</strong>
            </p>
            <p className="hint">تاريخ الميلاد محفوظ ولا يمكن تغييره. لتصحيح خطأ فيه تواصل مع الإدارة.</p>
          </>
        ) : status.unlocked ? (
          <BirthdayForm status={status} />
        ) : (
          <p>خيار عيد الميلاد يُفتح بعد استلام أول طلب. بعدها تحصل على خصم {percent}٪ على طلب واحد بيوم ميلادك.</p>
        )}
      </section>
    </div>
  );
}
