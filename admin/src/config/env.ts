/**
 * بيئة لوحة التحكم — تُختار عبر وضع Vite (`--mode dev|staging|prod`).
 *
 * القيمة تأتي من ملف `.env.<mode>`، فلا عنوان خادم مخبوز في الكود ولا
 * منظومة إعدادات ثانية: هذا هو نظام Vite القياسي مستعملاً كما هو.
 */
export type AppEnv = 'dev' | 'staging' | 'prod'

function normalise(raw: string | undefined): AppEnv {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'prod':
    case 'production':
      return 'prod'
    case 'staging':
    case 'stage':
      return 'staging'
    default:
      return 'dev'
  }
}

export const APP_ENV: AppEnv = normalise(import.meta.env.VITE_APP_ENV)

export interface EnvBadge {
  label: string
  color: string
}

/**
 * شارة البيئة الظاهرة في الترويسة.
 *
 * [CRITICAL] هذا هو الحاجز العملي ضد تعديل بيانات الإنتاج بالخطأ: اللوحات
 * الثلاث متطابقة بصرياً، فبلا علامة واضحة لا يعرف المسؤول أي قاعدة بيانات
 * يعدّل. الإنتاج بلا شارة عمداً — وجودُ الشارة يعني «لستَ في الإنتاج».
 */
export const ENV_BADGE: EnvBadge | null =
  APP_ENV === 'dev'
    ? { label: 'DEV', color: 'blue' }
    : APP_ENV === 'staging'
      ? { label: 'STAGING', color: 'orange' }
      : null
