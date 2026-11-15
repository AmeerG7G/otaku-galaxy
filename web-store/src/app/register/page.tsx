import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from '@/components/Link';
import { RegisterForm } from '@/components/AuthForms';
import { readSession } from '@/lib/server-session';
import { whatsappSignupEnabled } from '@/lib/whatsapp-signup';

export const metadata: Metadata = { title: 'طلب حساب', robots: { index: false } };

/**
 * `WHATSAPP_VERIFY_MODE=off` (or an API that predates it): the request form, exactly as before.
 *
 * `auto`: two equally visible paths first —
 * - WhatsApp: one message from the same number, then name/gender/password; the account is active at once.
 * - "Continue without WhatsApp" (`?method=manual`): the same administrator-reviewed request form;
 *   the request stays pending until an administrator approves it. Nothing here activates an account.
 * No personal data travels in the URL — only the chosen path.
 */
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ method?: string | string[] }> }) {
  if (await readSession()) redirect('/account');
  if (!(await whatsappSignupEnabled())) return <RegisterForm />;

  const { method } = await searchParams;
  if (method === 'manual') {
    return (
      <>
        <div className="card narrow form-links">
          <p className="hint">بلا واتساب: يُرسَل الطلب إلى الإدارة، ويُفعَّل الحساب بعد مراجعته.</p>
          <p className="hint">
            <Link href="/register/whatsapp">لديك واتساب؟ التفعيل الفوري متاح</Link>
          </p>
        </div>
        <RegisterForm />
      </>
    );
  }

  return (
    <div className="card narrow">
      <h1>طريقة إنشاء الحساب</h1>
      <Link className="btn btn-primary btn-block" href="/register/whatsapp">
        تحقّق عبر واتساب — يتفعّل حسابك فوراً
      </Link>
      <p className="hint">رسالة واحدة من واتساب على الرقم نفسه، ثم إكمال البيانات — والتفعيل فوري.</p>
      <Link className="btn btn-block" href="/register?method=manual">
        المتابعة بدون واتساب
      </Link>
      <p className="hint">بلا واتساب: يُرسَل الطلب إلى الإدارة، ويُفعَّل الحساب بعد مراجعته.</p>
    </div>
  );
}
