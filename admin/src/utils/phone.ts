/**
 * أرقام الهاتف في لوحة التحكم.
 *
 * الشكل المخزَّن على الخادم هو E.164 دائماً (`+9647XXXXXXXXX`) — انظر
 * `backend/src/utils/phone.ts`. اللوحة لا تعيد التطبيع ولا تخفي شيئاً: شاشات
 * `/admin` خلف مصادقة المسؤول، والطاقم يحتاج الرقم كاملاً للتواصل.
 */

/**
 * رقم هاتف الدخول إلى اللوحة: موبايل عراقي كامل بصيغته المحلية `07XXXXXXXXX`.
 *
 * القاعدة نفسها التي يطبّقها الخادم (`normalizeIraqiPhone`: الرقم الوطني
 * `7[5-9]` ثم ثمانية أرقام) وقيد القاعدة (`+9647[5-9]…`، الهجرة 037) وحقل
 * التطبيق — مكتوبةً بالصيغة التي يكتبها المسؤول. كان الحقل يقبل `^07\d{9}$`
 * فيمرّ `070…`–`074…` ثم يرفضه الخادم؛ الآن يُرفض هنا أولاً.
 */
export const IRAQI_MOBILE_PATTERN = /^07[5-9]\d{8}$/

/** `07` ثم تسعة أرقام. */
export const IRAQI_MOBILE_LENGTH = 11

/**
 * رابط محادثة واتساب للرقم.
 *
 * [CRITICAL] `wa.me` يقبل الرقم الدولي بلا `+` ولا فواصل ولا صفرٍ محلي —
 * `wa.me/07701234567` يفتح صفحة «رقم غير صالح». المخزَّن E.164 عادةً، لكن
 * رقم التواصل في طلبٍ قديم أو ما يلصقه المسؤول قد يكون محلياً، فيُطبَّع الرقم
 * العراقي بكل صيغه إلى `9647XXXXXXXXX` بقاعدة الخادم نفسها (`07[5-9]…`).
 * الرقم المقنَّع (`0770****567`) أو القصير لا رابط له (`null`) — الزرّ يُعطَّل
 * بدل أن يفتح محادثة مع رقمٍ خاطئ.
 *
 * يفتح الرابط محادثةً فارغة فقط؛ لا رسالة تُرسَل، ولا يُتَّصل بالزبون إلا
 * بضغطة المسؤول ثم إرساله بيده.
 */
export function whatsappUrl(phone: string | null | undefined): string | null {
  if (!phone || phone.includes('*')) return null
  const digits = phone.replace(/\D/g, '')
  const iraqi = iraqiInternational(digits)
  if (iraqi) return `https://wa.me/${iraqi}`
  // رقمٌ عراقي يبدأ بمقدّمته لكنه ليس موبايلاً صالحاً: لا رابط.
  if (/^(00)?9647/.test(digits) || /^07/.test(digits)) return null
  if (digits.length < 8 || digits.length > 15) return null
  return `https://wa.me/${digits.replace(/^00/, '')}`
}

/** موبايل عراقي بأي صيغة (‎+964، ‎00964، ‎964، ‎07، ‎7) → `9647XXXXXXXXX`، وإلا null. */
function iraqiInternational(digits: string): string | null {
  const national = digits.startsWith('00964')
    ? digits.slice(5)
    : digits.startsWith('964')
      ? digits.slice(3)
      : digits.startsWith('0')
        ? digits.slice(1)
        : digits
  return /^7[5-9]\d{8}$/.test(national) ? `964${national}` : null
}
