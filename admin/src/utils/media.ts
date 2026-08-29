const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api'

/** أصل الخادم (بلا `/api`) — منه تُبنى روابط الوسائط. */
const MEDIA_ORIGIN = API_BASE_URL.replace(/\/+$/, '').replace(/\/api$/, '')

/**
 * يحوّل مرجع وسائط كما يخزّنه الخادم إلى رابط يعرضه المتصفح.
 *
 * الخادم يخزّن مرجعاً نسبياً (`/uploads/...`) لأن الأصل يختلف باختلاف
 * العميل. لوحة الإدارة تعمل على أصل Vite (‎:5173‎) بينما الملفات تُقدَّم من
 * الـAPI (‎:4000‎)، فالمرجع النسبي وحده يحمّل من المكان الخطأ.
 *
 * القاعدة نفسها المطبَّقة في فلاتر (`resolveMediaUrl`)، حتى لا يختلف
 * تمثيلُ الصورة بين لوحة الإدارة والتطبيق.
 *
 * ملاحظة: هذه دالة **عرض** فقط. ما يُحفَظ في النموذج يبقى المرجعَ النسبي
 * كما أعاده الرفع — تحويلُه قبل الحفظ يُعيد خبْزَ الأصل في القاعدة، وهو
 * الخلل الذي جرى إصلاحه أصلاً.
 */
export function resolveMediaUrl(reference: string | null | undefined): string | undefined {
  const raw = reference?.trim()
  if (!raw) return undefined
  if (/^https?:\/\//i.test(raw)) return raw
  return `${MEDIA_ORIGIN}${raw.startsWith('/') ? raw : `/${raw}`}`
}
