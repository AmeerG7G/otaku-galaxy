'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { LoyaltyLevel } from '@/lib/types';
import { bff } from './client-api';
import { useHydrated } from './use-hydrated';

type Feedback = { kind: 'error' | 'success' | 'info'; text: string } | null;

function FeedbackAlert({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <p className={`alert alert-${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
      {feedback.text}
    </p>
  );
}

/** Every field is always sent as a string, so the API answers with its Arabic validation message. */
const value = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

/**
 * Login. The API decides everything: wrong password, account still waiting
 * for admin approval, rejected request, suspension — its Arabic message is
 * shown as-is. Admin accounts are refused by the BFF (`WEB_CUSTOMERS_ONLY`).
 */
export function LoginForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setFeedback(null);
    const result = await bff('/bff/session', {
      method: 'POST',
      body: { phone: value(form, 'phone'), password: String(form.get('password') ?? '') },
    });
    if (result.ok) {
      router.replace(returnTo);
      router.refresh();
      return;
    }
    setBusy(false);
    setFeedback({ kind: 'error', text: result.error?.message ?? 'تعذّر تسجيل الدخول' });
  }

  return (
    <form className="card narrow" method="post" onSubmit={submit} noValidate>
      <h1>تسجيل الدخول</h1>
      <FeedbackAlert feedback={feedback} />
      <div className="field">
        <label htmlFor="phone">رقم الهاتف</label>
        <input id="phone" name="phone" className="ltr" type="tel" inputMode="tel" autoComplete="tel" placeholder="07XXXXXXXXX" required />
      </div>
      <div className="field">
        <label htmlFor="password">كلمة المرور</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <button type="submit" className="btn btn-primary btn-block" disabled={busy || !hydrated}>
        {busy ? 'جارٍ الدخول…' : 'دخول'}
      </button>
      <p className="hint form-links">
        <Link href="/register">ما عندك حساب؟ اطلب حساباً</Link>
        <Link href="/forgot-password">نسيت كلمة المرور؟</Link>
      </p>
    </form>
  );
}

function GenderField() {
  return (
    <fieldset className="field choice-group">
      <legend>الجنس</legend>
      <label>
        <input type="radio" name="gender" value="male" required /> ذكر
      </label>
      <label>
        <input type="radio" name="gender" value="female" /> أنثى
      </label>
    </fieldset>
  );
}

/**
 * Account request. No SMS and no code: the request waits for the admin, who
 * confirms it over WhatsApp, and only then can the customer log in.
 */
export function RegisterForm() {
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setFeedback(null);
    const result = await bff('/bff/register', {
      method: 'POST',
      body: {
        username: value(form, 'username'),
        phone: value(form, 'phone'),
        password: String(form.get('password') ?? ''),
        gender: value(form, 'gender'),
      },
    });
    setBusy(false);
    if (result.ok) {
      setDone(result.message ?? 'استلمنا طلبك — ستتواصل معك الإدارة قريباً');
      return;
    }
    setFeedback({ kind: 'error', text: result.error?.message ?? 'تعذّر إرسال الطلب' });
  }

  if (done) {
    return (
      <div className="card narrow">
        <h1>طلب حساب</h1>
        <p className="alert alert-success" role="status">
          {done}
        </p>
        <p>بعد موافقة الإدارة تقدر تسجّل دخولك برقمك وكلمة المرور التي اخترتها.</p>
        <Link className="btn btn-block" href="/login">
          تسجيل الدخول
        </Link>
      </div>
    );
  }

  return (
    <form className="card narrow" method="post" onSubmit={submit} noValidate>
      <h1>طلب حساب</h1>
      <p className="hint">تراجع الإدارة طلبك وتتواصل معك عبر واتساب لتفعيله.</p>
      <FeedbackAlert feedback={feedback} />
      <div className="field">
        <label htmlFor="username">الاسم</label>
        <input id="username" name="username" autoComplete="name" minLength={2} maxLength={40} required />
      </div>
      <div className="field">
        <label htmlFor="phone">رقم الهاتف</label>
        <input id="phone" name="phone" className="ltr" type="tel" inputMode="tel" autoComplete="tel" placeholder="07XXXXXXXXX" required />
      </div>
      <div className="field">
        <label htmlFor="password">كلمة المرور</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        <span className="hint">8 أحرف على الأقل</span>
      </div>
      <GenderField />
      <button type="submit" className="btn btn-primary btn-block" disabled={busy || !hydrated}>
        {busy ? 'جارٍ الإرسال…' : 'إرسال الطلب'}
      </button>
      <p className="hint form-links">
        <Link href="/login">عندك حساب؟ سجّل الدخول</Link>
      </p>
    </form>
  );
}

/**
 * Forgotten password: identifying details for the admin, who verifies them
 * over WhatsApp and sets a new password. Nothing here proves identity.
 */
export function ForgotPasswordForm({ levels }: { levels: LoyaltyLevel[] }) {
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setFeedback(null);
    const result = await bff('/bff/forgot-password', {
      method: 'POST',
      body: {
        phone: value(form, 'phone'),
        username: value(form, 'username'),
        gender: value(form, 'gender'),
        levelKey: value(form, 'levelKey'),
      },
    });
    setBusy(false);
    if (result.ok) {
      setDone(result.message ?? 'استلمنا طلبك — ستتواصل معك الإدارة قريباً');
      return;
    }
    setFeedback({ kind: 'error', text: result.error?.message ?? 'تعذّر إرسال الطلب' });
  }

  if (done) {
    return (
      <div className="card narrow">
        <h1>نسيت كلمة المرور</h1>
        <p className="alert alert-success" role="status">
          {done}
        </p>
        <Link className="btn btn-block" href="/login">
          الرجوع لتسجيل الدخول
        </Link>
      </div>
    );
  }

  return (
    <form className="card narrow" method="post" onSubmit={submit} noValidate>
      <h1>نسيت كلمة المرور</h1>
      <p className="hint">أرسل بيانات حسابك، وتتحقق منها الإدارة عبر واتساب ثم تعيّن لك كلمة مرور جديدة.</p>
      <FeedbackAlert feedback={feedback} />
      <div className="field">
        <label htmlFor="phone">رقم الهاتف المسجَّل</label>
        <input id="phone" name="phone" className="ltr" type="tel" inputMode="tel" autoComplete="tel" placeholder="07XXXXXXXXX" required />
      </div>
      <div className="field">
        <label htmlFor="username">الاسم في الحساب</label>
        <input id="username" name="username" autoComplete="name" maxLength={40} required />
      </div>
      <GenderField />
      <div className="field">
        <label htmlFor="levelKey">مستواك الحالي</label>
        <select id="levelKey" name="levelKey" defaultValue="" required>
          <option value="" disabled>
            اختر المستوى
          </option>
          {levels.map((level) => (
            <option key={level.key} value={level.key}>
              {level.nameNeutral}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn btn-primary btn-block" disabled={busy || !hydrated}>
        {busy ? 'جارٍ الإرسال…' : 'إرسال الطلب'}
      </button>
    </form>
  );
}

export function LogoutButton() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-block"
      disabled={busy || !hydrated}
      onClick={async () => {
        setBusy(true);
        await bff('/bff/session/logout', { method: 'POST' });
        router.replace('/');
        router.refresh();
      }}
    >
      تسجيل الخروج
    </button>
  );
}
