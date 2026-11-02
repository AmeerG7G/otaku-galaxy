/**
 * أرقام الهاتف في لوحة التحكم.
 *
 * الشكل المخزَّن على الخادم هو E.164 دائماً (`+9647XXXXXXXXX`) — انظر
 * `backend/src/utils/phone.ts`. اللوحة لا تغيّر المخزَّن ولا تخفي شيئاً: شاشات
 * `/admin` خلف مصادقة المسؤول، والطاقم يحتاج الرقم كاملاً للتواصل. تعرضه
 * بصيغته المحلية `07…` في كل شاشة (`formatIraqiPhone` عبر `PhoneText`).
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
  const national = iraqiNational(digits)
  if (national) return `https://wa.me/964${national}`
  // رقمٌ عراقي يبدأ بمقدّمته لكنه ليس موبايلاً صالحاً: لا رابط.
  if (/^(00)?9647/.test(digits) || /^07/.test(digits)) return null
  if (digits.length < 8 || digits.length > 15) return null
  return `https://wa.me/${digits.replace(/^00/, '')}`
}

/**
 * رقم الهاتف كما يُعرض في اللوحة: الموبايل العراقي بصيغته المحلية `07XXXXXXXXX`
 * في كل شاشة، أيّاً كانت صيغته المخزَّنة (`+9647…` عادةً).
 *
 * [CRITICAL] للعرض وحده. ما يُرسَل إلى الخادم أو يُبنى منه رابط يبقى الرقم
 * المخزَّن نفسه: واتساب يطلب الدولي (`whatsappUrl`)، والخادم يطبّع كل صيغة
 * بنفسه. والنسخ ينسخ المعروض — `07…` هو ما يقبله حقل الهاتف وبحث اللوحة.
 *
 * يُحوَّل ما هو موبايلٌ عراقي **واضح** فقط: أرقامٌ لا غير، مع `+` في المقدّمة
 * وفواصل مألوفة (فراغ، شَرطة، قوسان، نقطة)، وتنتهي إلى `7[5-9]` ثم ثمانية
 * أرقام — قاعدة الخادم نفسها. ما سواه (دولي آخر، أرضي، مقنَّع، نصّ مثل
 * «غير متوفر») يُعرض كما وصل حرفاً بحرف، والغائب نصٌّ فارغ.
 */
export function formatIraqiPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const trimmed = phone.trim()
  if (!/^\+?[\d ()\-.]+$/.test(trimmed)) return phone
  const national = iraqiNational(trimmed.replace(/\D/g, ''))
  return national ? `0${national}` : phone
}

/** موبايل عراقي بأي صيغة (‎00964، ‎964، ‎0، أو بلا بادئة) → الرقم الوطني `7XXXXXXXXX`، وإلا null. */
function iraqiNational(digits: string): string | null {
  const national = digits.startsWith('00964')
    ? digits.slice(5)
    : digits.startsWith('964')
      ? digits.slice(3)
      : digits.startsWith('0')
        ? digits.slice(1)
        : digits
  return /^7[5-9]\d{8}$/.test(national) ? national : null
}
