import type { Metadata } from 'next';
import Link from '@/components/Link';
import { PasswordForm } from '@/components/AccountForms';
import { requireSession } from '@/lib/page-session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'تغيير كلمة المرور', robots: { index: false } };

export default async function PasswordPage() {
  await requireSession('/account/password');
  return (
    <div className="narrow stack">
      <p>
        <Link href="/account">حسابي</Link>
      </p>
      <h1>تغيير كلمة المرور</h1>
      <p className="hint">بعد التغيير تخرج كل أجهزتك الأخرى من الحساب، ويبقى هذا المتصفح داخلاً.</p>
      <PasswordForm />
    </div>
  );
}
