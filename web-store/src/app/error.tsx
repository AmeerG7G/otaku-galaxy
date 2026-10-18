'use client';

import Link from '@/components/Link';

/**
 * Anything a page failed to load (API down, timeout). Only a generic message
 * reaches the browser; Next.js keeps server error details out of production
 * responses (`digest` is an opaque id for the server log).
 */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="empty card narrow" role="alert">
      <h1>تعذّر تحميل الصفحة</h1>
      <p>حدث خطأ مؤقت. حاول مرة أخرى بعد لحظات.</p>
      <div className="form-links">
        <button type="button" className="btn btn-primary" onClick={reset}>
          إعادة المحاولة
        </button>
        <Link className="btn" href="/">
          الرئيسية
        </Link>
      </div>
    </div>
  );
}
