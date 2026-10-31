'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { resolveMediaUrl } from '@/lib/media';
import { MAX_REVIEW_PHOTOS } from '@/lib/review-input';
import type { Review } from '@/lib/types';
import { bff } from './client-api';
import { useHydrated } from './use-hydrated';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Review one product of a received order — or correct a rejected review and
 * resend it. Photos go up one by one through `/bff/uploads` (purpose
 * `review`); the review then carries the references the API returned, which
 * the API checks were uploaded by this customer. A sent review waits for the
 * admin before it is published.
 */
export function ReviewForm({
  orderId,
  productId,
  existing,
  mediaOrigin,
}: {
  orderId: string;
  productId: string;
  /** A rejected review being corrected; absent for a new one. */
  existing?: Review;
  mediaOrigin: string;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const id = useId();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [photos, setPhotos] = useState<string[]>(existing?.photoUrls ?? []);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  async function addPhoto(file: File) {
    setError(null);
    if (photos.length >= MAX_REVIEW_PHOTOS) {
      setError(`وصلت إلى الحد الأقصى (${MAX_REVIEW_PHOTOS} صور).`);
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError('حجم الصورة يتجاوز ٥ ميغابايت');
      return;
    }
    setUploading(true);
    const form = new FormData();
    form.set('purpose', 'review');
    form.set('file', file);
    let result: { ok: boolean; data?: { url: string }; error?: { message: string } };
    try {
      const response = await fetch('/bff/uploads', { method: 'POST', body: form, credentials: 'same-origin', cache: 'no-store' });
      result = { ok: response.ok, ...((await response.json().catch(() => ({}))) as object) };
    } catch {
      result = { ok: false, error: { message: 'تعذّر رفع الصورة، حاول مرة أخرى' } };
    }
    setUploading(false);
    if (result.ok && result.data?.url) setPhotos((current) => [...current, result.data!.url]);
    else setError(result.error?.message ?? 'تعذّر رفع الصورة، حاول مرة أخرى');
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (rating < 1) {
      setError('يرجى اختيار تقييم بالنجوم');
      return;
    }
    setBusy(true);
    setError(null);
    const body = { rating, comment: comment.trim(), photoUrls: photos };
    const result = existing
      ? await bff<Review>(`/bff/reviews/${existing.id}`, { method: 'PATCH', body })
      : await bff<Review>('/bff/reviews', { method: 'POST', body: { orderId, productId, ...body } });
    setBusy(false);
    if (!result.ok) {
      setError(result.error?.message ?? 'تعذر إرسال التقييم، حاول مرة أخرى');
      return;
    }
    setSent(result.message ?? 'سيتم مراجعة تقييمك قبل نشره.');
    router.refresh();
  }

  if (sent) {
    return (
      <p className="alert alert-success" role="status">
        {sent}
      </p>
    );
  }

  return (
    <form className="stack review-form" onSubmit={submit} noValidate>
      <fieldset className="field">
        <legend className="label">ما رأيك في المنتج؟</legend>
        <div className="star-input" role="radiogroup" aria-label="التقييم بالنجوم">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className={n <= rating ? 'star-input__on' : ''}>
              <input type="radio" name={`${id}-rating`} value={n} checked={rating === n} onChange={() => setRating(n)} />
              <span aria-hidden="true">★</span>
              <span className="visually-hidden">{n} من ٥</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor={`${id}-comment`}>التعليق (اختياري)</label>
        <textarea id={`${id}-comment`} rows={3} maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} />
      </div>

      <div className="field">
        <span className="label">الصور ({photos.length.toLocaleString('ar-IQ')} من {MAX_REVIEW_PHOTOS.toLocaleString('ar-IQ')})</span>
        <p className="hint">اختياري — إرفاق الصور يمنحك ٥ نقاط إضافية، سواء أرفقت صورة واحدة أو ٥.</p>
        {photos.length > 0 ? (
          <ul className="review__photos">
            {photos.map((ref, index) => {
              const src = resolveMediaUrl(ref, mediaOrigin);
              return (
                <li key={ref}>
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element -- API media origin
                    <img src={src} alt={`صورة ${index + 1}`} width={72} height={72} />
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-small"
                    aria-label={`إزالة الصورة ${index + 1}`}
                    onClick={() => setPhotos((current) => current.filter((value) => value !== ref))}
                  >
                    إزالة الصورة
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {photos.length < MAX_REVIEW_PHOTOS ? (
          <label className="btn btn-small file-pick">
            {uploading ? 'جارٍ رفع الصورة…' : 'إضافة صورة'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="visually-hidden"
              disabled={uploading || !hydrated}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void addPhoto(file);
              }}
            />
          </label>
        ) : (
          <p className="hint">وصلت إلى الحد الأقصى ({MAX_REVIEW_PHOTOS.toLocaleString('ar-IQ')} صور).</p>
        )}
      </div>

      {error ? (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="hint">لكل منتج تقييم واحد، ويُراجَع قبل نشره.</p>
      <button type="submit" className="btn btn-primary btn-block" disabled={busy || uploading || !hydrated}>
        {busy ? 'جارٍ الإرسال…' : existing ? 'إعادة الإرسال' : 'إرسال التقييم'}
      </button>
    </form>
  );
}
