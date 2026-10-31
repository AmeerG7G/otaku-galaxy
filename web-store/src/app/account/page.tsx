import type { Metadata } from 'next';
import Link from '@/components/Link';
import { LogoutButton } from '@/components/AuthForms';
import { mediaOrigin } from '@/lib/config';
import { localPhone } from '@/lib/format';
import { resolveMediaUrl } from '@/lib/media';
import { requireSession, sessionRead } from '@/lib/page-session';
import type { PublicUser } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'حسابي', robots: { index: false } };

const LINKS: Array<{ href: string; label: string }> = [
  { href: '/orders', label: 'طلباتي' },
  { href: '/favorites', label: 'المفضلة' },
  { href: '/points', label: 'نقاط المجرّة' },
  { href: '/notifications', label: 'الإشعارات' },
  { href: '/alerts', label: 'تنبيهات التوفر' },
  { href: '/account/birthday', label: 'تاريخ الميلاد' },
  { href: '/account/profile', label: 'تعديل الملف الشخصي' },
  { href: '/account/password', label: 'تغيير كلمة المرور' },
];

export default async function AccountPage() {
  const session = await requireSession('/account');
  const { user } = await sessionRead<{ user: PublicUser }>(session, '/auth/me', '/account');
  const avatar = resolveMediaUrl(user.avatarUrl, mediaOrigin());

  return (
    <div className="narrow stack">
      <h1>حسابي</h1>
      <section className="card account-head">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- API media origin
          <img className="avatar" src={avatar} alt="" width={64} height={64} />
        ) : (
          <span className="avatar avatar--empty" aria-hidden="true" />
        )}
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
      <nav className="card account-links" aria-label="روابط الحساب">
        <ul>
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href}>{link.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
      <p className="hint">لتغيير رقم الهاتف تواصل مع الإدارة.</p>
      <LogoutButton />
    </div>
  );
}
