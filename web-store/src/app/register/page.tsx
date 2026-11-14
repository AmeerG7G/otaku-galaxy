import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from '@/components/Link';
import { RegisterForm } from '@/components/AuthForms';
import { readSession } from '@/lib/server-session';
import { whatsappSignupEnabled } from '@/lib/whatsapp-signup';

export const metadata: Metadata = { title: 'طلب حساب', robots: { index: false } };

export default async function RegisterPage() {
  if (await readSession()) redirect('/account');
  // WhatsApp sign-up is an extra path (API `WHATSAPP_VERIFY_MODE=auto`); the form below stays the fallback.
  if (!(await whatsappSignupEnabled())) return <RegisterForm />;
  return (
    <>
      <p className="card narrow form-links">
        <Link className="btn btn-primary btn-block" href="/register/whatsapp">
          تحقّق عبر واتساب — يتفعّل حسابك فوراً
        </Link>
      </p>
      <RegisterForm />
    </>
  );
}
