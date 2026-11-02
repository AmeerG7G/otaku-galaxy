import { apiUpload } from '@/lib/api';
import { bffError, bffJson, handleBff } from '@/lib/bff';

/**
 * One photo for a review or the customer's avatar, passed to the API's upload
 * route with the customer's token. The API is the authority on the bytes
 * (magic numbers, not the file name), the size and the daily quota; this
 * refuses early only what it would refuse anyway, so a large body is never
 * buffered and forwarded.
 */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
// Multipart framing adds a few hundred bytes around the file itself.
const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;
const PURPOSES = new Set(['review', 'avatar']);

const tooLarge = () => bffError(413, 'FILE_TOO_LARGE', 'حجم الصورة يتجاوز ٥ ميغابايت');

/** The request body, or `null` once it passes `limit` bytes — never buffered past the cap. */
async function readBounded(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function POST(request: Request) {
  return handleBff(request, { auth: true }, async ({ session }) => {
    const declared = request.headers.get('content-length');
    if (declared !== null && !(Number(declared) <= MAX_BODY_BYTES)) return tooLarge();
    // A chunked body has no length to check: read it, stopping at the cap.
    const body = await readBounded(request, MAX_BODY_BYTES);
    if (!body) return tooLarge();
    let form: FormData;
    try {
      form = await new Response(body, { headers: { 'content-type': request.headers.get('content-type') ?? '' } }).formData();
    } catch {
      return bffError(400, 'FILE_REQUIRED', 'لم تُرفق صورة');
    }
    const file = form.get('file');
    const purpose = form.get('purpose');
    if (!(file instanceof Blob) || file.size === 0) return bffError(400, 'FILE_REQUIRED', 'لم تُرفق صورة');
    if (file.size > MAX_UPLOAD_BYTES) return tooLarge();
    if (typeof purpose !== 'string' || !PURPOSES.has(purpose)) return bffError(403, 'FORBIDDEN', 'غير مسموح برفع هذا النوع');

    // Only the two fields the API reads; the browser's file name is not forwarded.
    const upstream = new FormData();
    upstream.set('purpose', purpose);
    upstream.set('file', file, 'upload');
    const { data, message } = await apiUpload<{ id: string; url: string }>('/uploads', upstream, session!.token);
    return bffJson(201, { data: { url: data.url }, message });
  });
}
