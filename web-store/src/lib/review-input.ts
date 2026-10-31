/**
 * The review fields the website forwards — exactly the app's, nothing else.
 *
 * Only shape is checked here (so a malformed request never reaches the API);
 * every rule that matters — the order is the caller's and received, one review
 * per product, at most five photos, each photo uploaded by the caller — is the
 * API's (`reviewsService`), as it is for the app.
 */
export const MAX_REVIEW_PHOTOS = 5;

export interface ReviewInput {
  rating: number;
  comment: string;
  photoUrls: string[];
}

export function parseReviewInput(body: Record<string, unknown> | null): ReviewInput | null {
  if (!body) return null;
  const { rating, comment, photoUrls } = body;
  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  if (comment !== undefined && typeof comment !== 'string') return null;
  if (photoUrls !== undefined && !Array.isArray(photoUrls)) return null;
  const photos = (photoUrls ?? []) as unknown[];
  if (photos.length > MAX_REVIEW_PHOTOS) return null;
  // A photo is a reference the upload route returned — never a URL the browser chose.
  if (!photos.every((ref) => typeof ref === 'string' && /^\/uploads\/[A-Za-z0-9/_.-]{1,400}$/.test(ref) && !ref.includes('..'))) return null;
  return { rating, comment: typeof comment === 'string' ? comment.slice(0, 1000) : '', photoUrls: photos as string[] };
}
