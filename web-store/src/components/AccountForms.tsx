'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { daysInMonth, MONTH_NAMES } from '@/lib/birthday';
import { resolveMediaUrl } from '@/lib/media';
import type { BirthdayStatus } from '@/lib/types';
import { bff } from './client-api';
import { useHydrated } from './use-hydrated';

type Feedback = { kind: 'error' | 'success'; text: string } | null;

function FeedbackAlert({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <p className={`alert alert-${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
      {feedback.text}
    </p>
  );
}

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Name, gender and photo — what the app's settings edit (`PATCH /auth/me`).
 * Only changed fields are sent; the API validates each one and owns the rules
 * (two genders, the photo must be this customer's upload).
 */
export function ProfileForm({
  initial,
  mediaOrigin,
}: {
  initial: { username: string; gender: 'male' | 'female' | null; avatarUrl: string | null };
  mediaOrigin: string;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [username, setUsername] = useState(initial.username);
  const [gender, setGender] = useState(initial.gender);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function uploadAvatar(file: File) {
    setFeedback(null);
    if (file.size > MAX_PHOTO_BYTES) {
      setFeedback({ kind: 'error', text: 'حجم الصورة يتجاوز ٥ ميغابايت' });
      return;
    }
    setUploading(true);
    const form = new FormData();
    form.set('purpose', 'avatar');
    form.set('file', file);
    try {
      const response = await fetch('/bff/uploads', { method: 'POST', body: form, credentials: 'same-origin', cache: 'no-store' });
      const json = (await response.json().catch(() => ({}))) as { data?: { url: string }; error?: { message: string } };
      if (response.ok && json.data?.url) setAvatarUrl(json.data.url);
      else setFeedback({ kind: 'error', text: json.error?.message ?? 'تعذّر رفع الصورة، حاول مرة أخرى' });
    } catch {
      setFeedback({ kind: 'error', text: 'تعذّر رفع الصورة، حاول مرة أخرى' });
    }
    setUploading(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const patch: Record<string, unknown> = {};
    if (username.trim() !== initial.username) patch.username = username.trim();
    if (gender && gender !== initial.gender) patch.gender = gender;
    if (avatarUrl !== initial.avatarUrl) patch.avatarUrl = avatarUrl;
    if (Object.keys(patch).length === 0) {
      setFeedback({ kind: 'success', text: 'لا تغييرات لحفظها' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    const result = await bff('/bff/account/profile', { method: 'PATCH', body: patch });
    setBusy(false);
    if (result.ok) {
      setFeedback({ kind: 'success', text: 'تم حفظ التغييرات' });
      router.refresh();
    } else setFeedback({ kind: 'error', text: result.error?.message ?? 'تعذّر الحفظ، حاول مرة أخرى' });
  }

  const avatar = resolveMediaUrl(avatarUrl, mediaOrigin);
  return (
    <form className="card stack" onSubmit={submit} noValidate>
      <FeedbackAlert feedback={feedback} />
      <div className="field avatar-field">
        <span className="label">الصورة الشخصية</span>
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- API media origin
          <img className="avatar" src={avatar} alt="صورتك الشخصية" width={72} height={72} />
        ) : (
          <span className="avatar avatar--empty" aria-hidden="true" />
        )}
        <div className="row">
          <label className="btn btn-small file-pick">
            {uploading ? 'جارٍ رفع الصورة…' : 'تغيير الصورة'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="visually-hidden"
              disabled={uploading || !hydrated}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void uploadAvatar(file);
              }}
            />
          </label>
          {avatarUrl ? (
            <button type="button" className="btn btn-small" onClick={() => setAvatarUrl(null)}>
              إزالة الصورة
            </button>
          ) : null}
        </div>
      </div>
      <div className="field">
        <label htmlFor="username">الاسم</label>
        <input id="username" name="username" autoComplete="name" maxLength={40} value={username} onChange={(event) => setUsername(event.target.value)} />
      </div>
      <fieldset className="field">
        <legend className="label">الجنس</legend>
        <div className="row">
          {(
            [
              ['male', 'ذكر'],
              ['female', 'أنثى'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="choice">
              <input type="radio" name="gender" value={value} checked={gender === value} onChange={() => setGender(value)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit" className="btn btn-primary btn-block" disabled={busy || uploading || !hydrated}>
        {busy ? 'جارٍ الحفظ…' : 'حفظ'}
      </button>
    </form>
  );
}

/**
 * Change the password. The API checks the current one and signs out every
 * other device; this browser receives the new session at once.
 */
export function PasswordForm() {
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const currentPassword = String(form.get('currentPassword') ?? '');
    const newPassword = String(form.get('newPassword') ?? '');
    const confirm = String(form.get('confirmPassword') ?? '');
    if (!currentPassword) return setFeedback({ kind: 'error', text: 'أدخل كلمة المرور الحالية' });
    if (newPassword.length < 8) return setFeedback({ kind: 'error', text: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
    if (newPassword !== confirm) return setFeedback({ kind: 'error', text: 'كلمتا المرور غير متطابقتين' });
    setBusy(true);
    setFeedback(null);
    const result = await bff('/bff/account/password', { method: 'PATCH', body: { currentPassword, newPassword } });
    setBusy(false);
    if (result.ok) {
      formElement.reset();
      setFeedback({ kind: 'success', text: `${result.message ?? 'تم تغيير كلمة المرور بنجاح'} — خرجت أجهزتك الأخرى من الحساب.` });
    } else setFeedback({ kind: 'error', text: result.error?.message ?? 'تعذّر تغيير كلمة المرور' });
  }

  return (
    <form className="card stack" onSubmit={submit} noValidate>
      <FeedbackAlert feedback={feedback} />
      <div className="field">
        <label htmlFor="currentPassword">كلمة المرور الحالية</label>
        <input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </div>
      <div className="field">
        <label htmlFor="newPassword">كلمة المرور الجديدة</label>
        <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div className="field">
        <label htmlFor="confirmPassword">تأكيد كلمة المرور الجديدة</label>
        <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <button type="submit" className="btn btn-primary btn-block" disabled={busy || !hydrated}>
        {busy ? 'جارٍ الحفظ…' : 'تغيير كلمة المرور'}
      </button>
    </form>
  );
}

/** Set the birthday once. The API refuses before the first received order and after it is saved. */
export function BirthdayForm({ status }: { status: BirthdayStatus }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [day, setDay] = useState(0);
  const [month, setMonth] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const maxDay = month ? daysInMonth(month) : 31;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!month) return setFeedback({ kind: 'error', text: 'شهر غير صالح' });
    if (!day || day > maxDay) return setFeedback({ kind: 'error', text: 'يوم غير صالح' });
    setBusy(true);
    setFeedback(null);
    const result = await bff('/bff/birthday', { method: 'POST', body: { day, month } });
    setBusy(false);
    if (result.ok) router.refresh();
    else setFeedback({ kind: 'error', text: result.error?.message ?? 'تعذّر حفظ تاريخ الميلاد، حاول مرة أخرى' });
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <p>نعطيك خصم {status.discountPercent.toLocaleString('ar-IQ')}٪ على طلب واحد بيوم ميلادك. لا يمكن تغيير التاريخ بعد حفظه.</p>
      <FeedbackAlert feedback={feedback} />
      <div className="row">
        <div className="field">
          <label htmlFor="birth-day">اليوم</label>
          <select id="birth-day" value={day} onChange={(event) => setDay(Number(event.target.value))}>
            <option value={0} disabled>
              اليوم
            </option>
            {Array.from({ length: maxDay }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>
                {value.toLocaleString('ar-IQ')}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="birth-month">الشهر</label>
          <select id="birth-month" value={month} onChange={(event) => setMonth(Number(event.target.value))}>
            <option value={0} disabled>
              الشهر
            </option>
            {MONTH_NAMES.map((name, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button type="submit" className="btn btn-primary" disabled={busy || !hydrated}>
        {busy ? 'جارٍ الحفظ…' : 'حفظ تاريخ الميلاد'}
      </button>
    </form>
  );
}

/** Claim a level's reward. Reserves it for the next order or the admin's delivery — points are not deducted. */
export function ClaimRewardButton({ levelKey, label }: { levelKey: string; label: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  return (
    <div className="stack">
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy || !hydrated}
        onClick={async () => {
          setBusy(true);
          setFeedback(null);
          const result = await bff(`/bff/points/rewards/${levelKey}/claim`, { method: 'POST' });
          setBusy(false);
          if (result.ok) {
            setFeedback({ kind: 'success', text: result.message ?? 'سُجّلت ميزتك 🎉' });
            router.refresh();
          } else setFeedback({ kind: 'error', text: result.error?.message ?? 'تعذّرت المطالبة بالميزة، حاول مرة أخرى' });
        }}
      >
        {busy ? 'جاري التسجيل…' : label}
      </button>
      <FeedbackAlert feedback={feedback} />
    </div>
  );
}

/** Mark every notification read. */
export function MarkAllReadButton() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn btn-small"
        disabled={busy || !hydrated}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await bff('/bff/notifications/read-all', { method: 'POST' });
          setBusy(false);
          if (result.ok) router.refresh();
          else setError(result.error?.message ?? 'تعذّر إتمام العملية، حاول مرة أخرى');
        }}
      >
        تعليم الكل كمقروء
      </button>
      {error ? (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

/** Mark one notification read (an unread one shows this; opening its link does not mark it). */
export function MarkReadButton({ id }: { id: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn btn-small"
        disabled={busy || !hydrated}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await bff(`/bff/notifications/${id}/read`, { method: 'POST' });
          setBusy(false);
          if (result.ok) router.refresh();
          else setError(result.error?.message ?? 'تعذّر إتمام العملية، حاول مرة أخرى');
        }}
      >
        تعليم كمقروء
      </button>
      {error ? (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
