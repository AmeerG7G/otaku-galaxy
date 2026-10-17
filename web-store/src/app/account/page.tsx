import type { Metadata } from 'next';
import Link from 'next/link';
import { LogoutButton } from '@/components/AuthForms';
import { localPhone } from '@/lib/format';
import { requireSession, sessionRead } from '@/lib/page-session';
import type { PublicUser } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'حسابي', robots: { index: false } };

export default async function AccountPage() {
  const session = await requireSession('/account');
  const { user } = await sessionRead<{ user: PublicUser }>(session, '/auth/me', '/account');

  return (
    <div className="narrow stack">
      <h1>حسابي</h1>
      <section className="card">
        <dl className="details">
          <div>
            <dt>الاسم</dt>
            <dd>{user.username}</dd>
          </div>
          <div>
            <dt>رقم الهاتف</dt>
            <dd>
              <bdi>{localPhone(user.phone)}</bdi>
            </dd>
          </div>
        </dl>
      </section>
      <nav className="card stack" aria-label="روابط الحساب">
        <Link className="btn btn-block" href="/orders">
          طلباتي
        </Link>
        <Link className="btn btn-block" href="/cart">
          السلة
        </Link>
      </nav>
      <p className="hint">لتعديل بيانات الحساب أو كلمة المرور استعمل تطبيق مجرة الأوتاكو، أو تواصل مع الإدارة.</p>
      <LogoutButton />
    </div>
  );
}
