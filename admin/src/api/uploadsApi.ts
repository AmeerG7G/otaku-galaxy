import { ApiError, client } from './client'
import type { ApiEnvelope } from '../types/api'
import { isValidImageRef } from '../utils/media'

export type UploadPurpose =
  | 'product'
  | 'banner'
  | 'franchise'
  | 'review'
  | 'avatar'
  | 'category'

/** سقف الخادم للملف الواحد (`UPLOADS_MAX_BYTES`) — يُفحص هنا قبل إرسال بايتٍ واحد. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

/**
 * مهلة الرفع — لا مهلة طلبات JSON (١٥ ثانية في `client`).
 *
 * [CRITICAL] اللوحة ترفع الصورة الأصلية بلا تصغير، حتى ٥ ميغابايت. بمهلة ١٥
 * ثانية كان الرفع يحتاج ≥ ٢٫٨ ميغابت/ث صعوداً وإلا قُطع «انتهت مهلة الاتصال» —
 * لا يظهر على `localhost` أبداً ويظهر على خط الاختبار المسبق الحقيقي. دقيقتان
 * تكفيان ٥ ميغابايت على ~٣٥٠ كيلوبت/ث، ودون مهلة Cloudflare لردّ الأصل (١٠٠
 * ثانية) التي تبدأ بعد اكتمال الجسم لا قبله.
 */
export const UPLOAD_TIMEOUT_MS = 120_000

type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp'

const EXTENSIONS: Record<ImageMime, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}

/** رفضٌ محليّ قبل الشبكة — رسالته تُعرض كما هي. */
export class UploadRejectedError extends Error {
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'UploadRejectedError'
    this.code = code
  }
}

/**
 * النوع الحقيقي من التوقيع الثنائي — المرآة نفسها لـ`sniffImageMime` في الخادم.
 *
 * `File.type` يستنتجه المتصفّح من الامتداد لا من المحتوى، فلا يُعتمد عليه.
 */
export async function sniffImageType(file: Blob): Promise<ImageMime | null> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (b.length >= 8 && png.every((byte, i) => b[i] === byte)) return 'image/png'
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to))
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  return null
}

/**
 * يرفع صورة إلى الخادم ويعيد مرجعها (`/uploads/...`) الجاهز للحفظ مع المنتج/البنر.
 *
 * لا نحدّد Content-Type يدوياً حتى يضبط المتصفح حدود FormData بنفسه — والإلغاء
 * صريح لأن `client` يحمل `application/json` افتراضياً وaxios يحوّل FormData إلى
 * JSON متى رآها (انظر `uploadsApi.test.ts`).
 *
 * الملف يُوسَم بنوعه **الحقيقي** واسمٍ محايد: يقبله حتى خادمٌ أقدم يفحص الوسم
 * المعلَن، ولا يخرج اسم ملف المسؤول من جهازه.
 */
export async function uploadImage(file: File, purpose: UploadPurpose): Promise<string> {
  if (file.size === 0) {
    throw new UploadRejectedError('الملف فارغ', 'EMPTY_FILE')
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadRejectedError('حجم الصورة أكبر من الحدّ المسموح (5 ميغابايت)', 'FILE_TOO_LARGE')
  }
  const type = await sniffImageType(file)
  if (!type) {
    throw new UploadRejectedError('نوع الصورة غير مدعوم (JPG/PNG/WebP فقط)', 'UNSUPPORTED_MEDIA')
  }

  const form = new FormData()
  form.append('file', new File([file], `image${EXTENSIONS[type]}`, { type }))
  form.append('purpose', purpose)

  const response = await client.post<ApiEnvelope<{ id: string; url: string }>>(
    '/admin/uploads',
    form,
    { headers: { 'Content-Type': undefined }, timeout: UPLOAD_TIMEOUT_MS },
  )
  // ردٌّ «ناجح» بلا مرجع صورة صالح لا يُحفظ في النموذج — كان `data!.url`
  // يرمي «Cannot read properties of null» بالإنجليزية أو يحفظ `undefined`.
  const url = response.data?.data?.url
  if (typeof url !== 'string' || !isValidImageRef(url)) {
    throw new ApiError('استجابة غير صالحة من الخادم — أعد المحاولة', response.status, 'INVALID_RESPONSE')
  }
  return url
}
