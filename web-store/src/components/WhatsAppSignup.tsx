'use client';

import Link from '@/components/Link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GenderField } from './AuthForms';
import { bff } from './client-api';
import { PhoneField, usePhoneField } from './PhoneField';
import { useHydrated } from './use-hydrated';

/**
 * WhatsApp sign-up (API `WHATSAPP_VERIFY_MODE=auto`): phone → send the
 * prefilled WhatsApp message → name, gender, password → signed in.
 *
 * The API decides every state; this page only polls (every 3 s for a minute,
 * then 6 s, and at once when the tab becomes visible again). The password is
 * asked for only after the API says "verified". The manual account request
 * stays one click away at every step.
 *
 * ⚠ Arabic copy is a draft for the owner to replace (Phase A).
 */

type Phase = 'pending' | 'awaiting_contact' | 'verified' | 'completed' | 'expired' | 'mismatch' | 'phone_taken' | 'dead';
interface Started {
  code: string;
  waLink: string;
  businessNumber: string;
  expiresAt: string;
}
interface StatusData extends Started {
  status: Phase;
  lastAttemptMismatched?: boolean;
}

const TERMINAL: Phase[] = ['expired', 'mismatch', 'phone_taken', 'dead', 'completed'];
const FAST_MS = 3_000;
const SLOW_MS = 6_000;
const FAST_PERIOD_MS = 60_000;

const TERMINAL_TEXT: Record<string, string> = {
  expired: 'انتهت المهلة قبل وصول رسالتك.',
  mismatch: 'وصلت رسائل من رقم واتساب غير الرقم الذي أدخلته.',
  phone_taken: 'هذا الرقم لديه حساب بالفعل.',
  dead: 'تعذّر التحقق من هذا الرقم عبر واتساب.',
};

function useCountdown(expiresAt: string | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);
  if (!expiresAt) return '';
  const left = Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

export function WhatsAppSignup() {
  const hydrated = useHydrated();
  const router = useRouter();
  const phone = usePhoneField();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Started | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [mismatched, setMismatched] = useState(false);
  const [offline, setOffline] = useState(false);
  const [copied, setCopied] = useState(false);
  const failures = useRef(0);
  const pollingSince = useRef<number>(0);
  const timer = useRef<number | null>(null);
  /** The poll loop re-arms itself through this ref (a callback cannot name itself). */
  const pollRef = useRef<() => Promise<void>>(async () => {});
  const countdown = useCountdown(session?.expiresAt ?? null);

  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const poll = useCallback(async () => {
    stop();
    const result = await bff<StatusData>('/bff/register/whatsapp/status', { method: 'POST', body: {} });
    if (result.ok && result.data) {
      failures.current = 0;
      setOffline(false);
      const data = result.data;
      setSession({ code: data.code, waLink: data.waLink, businessNumber: data.businessNumber, expiresAt: data.expiresAt });
      setPhase(data.status);
      setMismatched(Boolean(data.lastAttemptMismatched));
      if (data.status === 'verified' || TERMINAL.includes(data.status)) return;
    } else if (result.status === 404 || result.status === 410) {
      setPhase((current) => (current === null ? null : 'expired'));
      return;
    } else {
      failures.current += 1;
      setOffline(failures.current >= 3);
    }
    const elapsed = Date.now() - pollingSince.current;
    timer.current = window.setTimeout(() => void pollRef.current(), elapsed < FAST_PERIOD_MS ? FAST_MS : SLOW_MS);
  }, []);

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  // A session this browser already started (reload, back from WhatsApp) resumes.
  // The first poll runs from a timer, not synchronously inside the effect.
  useEffect(() => {
    pollingSince.current = Date.now();
    const first = window.setTimeout(() => void pollRef.current(), 0);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void pollRef.current();
      else stop();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(first);
      document.removeEventListener('visibilitychange', onVisible);
      stop();
    };
  }, []);

  async function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !phone.check()) return;
    setBusy(true);
    setError(null);
    const result = await bff<Started>('/bff/register/whatsapp/start', { method: 'POST', body: { phone: phone.submitValue } });
    setBusy(false);
    if (!result.ok || !result.data) {
      setError(result.error?.message ?? 'تعذّر بدء التحقق');
      return;
    }
    setSession(result.data);
    setPhase('pending');
    setMismatched(false);
    pollingSince.current = Date.now();
    timer.current = window.setTimeout(() => void pollRef.current(), FAST_MS);
  }

  async function complete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const result = await bff('/bff/register/whatsapp/complete', {
      method: 'POST',
      body: {
        username: String(form.get('username') ?? '').trim(),
        gender: String(form.get('gender') ?? ''),
        password: String(form.get('password') ?? ''),
      },
    });
    if (result.ok) {
      router.replace('/account');
      router.refresh();
      return;
    }
    setBusy(false);
    const code = result.error?.code;
    if (code === 'PHONE_TAKEN') setPhase('phone_taken');
    else if (code === 'SESSION_EXPIRED' || code === 'SESSION_NOT_FOUND') setPhase('expired');
    else if (code === 'SESSION_DEAD' || code === 'SESSION_ATTEMPTS_EXCEEDED') setPhase('dead');
    setError(result.error?.message ?? 'تعذّر إنشاء الحساب');
  }

  async function copyMessage() {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(decodeURIComponent(session.waLink.split('text=')[1] ?? session.code));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function restart() {
    stop();
    setSession(null);
    setPhase(null);
    setError(null);
  }

  const manual = (
    <p className="hint form-links">
      <Link href="/register">اطلب حساباً بمراجعة الإدارة بدلاً من ذلك</Link>
    </p>
  );

  if (phase === 'verified') {
    return (
      <form className="card narrow" method="post" onSubmit={complete} noValidate>
        <h1>التحقق عبر واتساب</h1>
        <p className="alert alert-success" role="status">تم التحقق من رقمك ✓ أكمل بياناتك</p>
        {error && <p className="alert alert-error" role="alert">{error}</p>}
        <div className="field">
          <label htmlFor="username">الاسم</label>
          <input id="username" name="username" autoComplete="name" minLength={2} maxLength={40} required />
        </div>
        <div className="field">
          <label htmlFor="password">كلمة المرور</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          <span className="hint">8 أحرف على الأقل</span>
        </div>
        <GenderField />
        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !hydrated}>
          {busy ? 'جارٍ الإنشاء…' : 'إنشاء الحساب'}
        </button>
      </form>
    );
  }

  if (session && phase && TERMINAL.includes(phase)) {
    return (
      <div className="card narrow">
        <h1>التحقق عبر واتساب</h1>
        <p className="alert alert-info" role="status">{TERMINAL_TEXT[phase] ?? TERMINAL_TEXT.dead}</p>
        {phase === 'phone_taken' ? (
          <Link className="btn btn-primary btn-block" href="/login">تسجيل الدخول</Link>
        ) : (
          <button type="button" className="btn btn-primary btn-block" onClick={restart}>ابدأ من جديد</button>
        )}
        {manual}
      </div>
    );
  }

  if (session) {
    const status = offline
      ? 'لا اتصال — نحاول مجدداً…'
      : phase === 'awaiting_contact'
        ? 'افتح واتساب واضغط «مشاركة رقم الهاتف» في ردّنا لإكمال التحقق.'
        : mismatched
          ? 'وصلت رسالة من رقم واتساب مختلف — تأكّد أن واتساب على الرقم نفسه الذي أدخلته.'
          : 'بانتظار رسالتك… ارجع إلى هذه الصفحة بعد الإرسال.';
    return (
      <div className="card narrow">
        <h1>التحقق عبر واتساب</h1>
        <p>افتح واتساب وأرسل الرسالة الجاهزة كما هي — تحمل هذا الرمز:</p>
        <p className="wa-code" dir="ltr">
          <strong>{session.code}</strong>
        </p>
        <p className="hint" dir="ltr">{session.businessNumber}</p>
        <a className="btn btn-primary btn-block" href={session.waLink} target="_blank" rel="noopener noreferrer">
          فتح واتساب
        </a>
        <button type="button" className="btn btn-block" onClick={copyMessage}>
          {copied ? 'تم النسخ' : 'نسخ الرسالة'}
        </button>
        <p className="hint">على الحاسوب: يفتح الرابطُ واتساب ويب أو تطبيق الحاسوب. إن لم يكن عندك أيٌّ منهما، انسخ الرسالة وأرسلها من هاتفك إلى الرقم أعلاه.</p>
        <p role="status" className={mismatched && !offline ? 'alert alert-error' : 'hint'}>{status}</p>
        <p className="hint">تنتهي المهلة خلال {countdown}</p>
        <p className="hint">أرسل هذا الرمز من هاتفك أنت فقط. مجرة الأوتاكو لا تطلب منك أبداً أن ترسل رمزاً نيابةً عن شخصٍ آخر.</p>
        {manual}
      </div>
    );
  }

  return (
    <form className="card narrow" method="post" onSubmit={start} noValidate>
      <h1>التحقق عبر واتساب</h1>
      <p className="hint">رسالة واحدة منك على واتساب تثبت أن الرقم رقمك، ويتفعّل حسابك فوراً.</p>
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      <PhoneField label="رقم الهاتف" value={phone.value} onChange={phone.onChange} error={phone.error} />
      <button type="submit" className="btn btn-primary btn-block" disabled={busy || !hydrated}>
        {busy ? 'جارٍ البدء…' : 'متابعة'}
      </button>
      {manual}
    </form>
  );
}
