import Link from '@/components/Link';
import { formatDateTime } from '@/lib/format';
import type { Review } from '@/lib/types';
import { Stars } from './Stars';

/**
 * Approved reviews of a product, newest first, one bounded page at a time.
 * Only reviews the admin approved reach this list (the API filters), so there
 * is nothing to moderate or hide here.
 */
export function ProductReviews({
  productId,
  reviews,
  rating,
  reviewCount,
  page,
  hasMore,
}: {
  productId: string;
  reviews: Review[];
  rating: number | null;
  reviewCount: number;
  page: number;
  hasMore: boolean;
}) {
  return (
    <section className="stack reviews" aria-labelledby="reviews-title">
      <div className="section-head">
        <h2 id="reviews-title">⭐ تقييمات العملاء</h2>
        {rating !== null && reviewCount > 0 ? (
          <span className="reviews__summary">
            <Stars value={rating} />
            <span>{rating.toLocaleString('ar-IQ', { maximumFractionDigits: 1 })}</span>
          </span>
        ) : null}
      </div>
      {reviewCount > 0 ? <p className="hint">{reviewCount.toLocaleString('ar-IQ')} تقييم من عملاء اشتروا هذا المنتج</p> : null}

      {reviews.length === 0 ? (
        page > 1 ? (
          <p className="hint">لا مزيد من التقييمات.</p>
        ) : (
          <div className="card">
            <p>
              <strong>لا توجد تقييمات لهذا المنتج بعد</strong>
            </p>
            <p className="hint">كن أول من يشارك تجربته بعد استلام طلبه.</p>
          </div>
        )
      ) : (
        <ul className="review-list">
          {reviews.map((review) => (
            <li key={review.id} className="card review">
              <div className="review__head">
                <strong>{review.customerName}</strong>
                <Stars value={review.rating} />
              </div>
              <p className="hint">
                ✓ اشترى هذا المنتج · <time dateTime={review.createdAt}>{formatDateTime(review.createdAt)}</time>
              </p>
              {review.comment ? <p className="review__comment">{review.comment}</p> : null}
              {review.photoUrls.length > 0 ? (
                <ul className="review__photos" aria-label="صور العميل">
                  {review.photoUrls.map((url, index) => (
                    <li key={url}>
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element -- API media origin */}
                        <img src={url} alt={`صورة ${index + 1} من العميل`} width={88} height={88} loading="lazy" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {page > 1 || hasMore ? (
        <nav className="pagination" aria-label="صفحات التقييمات">
          {page > 1 ? (
            <Link href={page === 2 ? `/p/${productId}#reviews-title` : `/p/${productId}?reviews=${page - 1}#reviews-title`}>السابق</Link>
          ) : null}
          <span className="pagination__current">صفحة {page.toLocaleString('ar-IQ')}</span>
          {hasMore ? <Link href={`/p/${productId}?reviews=${page + 1}#reviews-title`}>التالي</Link> : null}
        </nav>
      ) : null}
    </section>
  );
}
