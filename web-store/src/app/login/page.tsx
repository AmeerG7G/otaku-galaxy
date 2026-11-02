import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/AuthForms';
import { siteOrigin } from '@/lib/config';
import { safeReturnTo } from '@/lib/security';
import { readSession } from '@/lib/server-session';

export const metadata: Metadata = { title: 'تسجيل الدخول', robots: { index: false } };

type Props = { searchParams: Promise<{ returnTo?: string | string[]; expired?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const returnTo = safeReturnTo(Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo, siteOrigin());
  if (await readSession()) redirect(returnTo);
  return (
    <>
      {params.expired ? (
        <p className="alert alert-info narrow" role="status">
          انتهت جلستك — سجّل الدخول من جديد.
        </p>
      ) : null}
      <LoginForm returnTo={returnTo} />
    </>
  );
}
