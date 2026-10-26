/**
 * هل نصّ خيار سطر العربة (`optionValue`) يطابق خيارات المنتج الحقيقية؟
 *
 * العميلان يرسلان القيم المختارة نصّاً واحداً مجموعاً بـ«، »: التطبيق بترتيب
 * نقر الزبون (`_selectedOptions` خريطةٌ تُملأ بالنقر)، والمتجر بترتيب خيارات
 * المنتج. فالنصّ الصالح قيمةٌ واحدة لكل خيار، **بأي ترتيب**، من قيمه العربية
 * أو الكردية — الواجهة الكردية تعرض `values_ckb` بدل `values` (`localizeOption`)
 * وترسل ما عرضته.
 *
 * [CRITICAL] لا تقسيم على الفاصل. قيمةٌ مثل «أحمر، أسود» تحوي «، » نفسها،
 * فتقسيمُ النصّ أولاً يراها قيمتين ويرفض اختياراً صحيحاً. بدل ذلك تُستهلك
 * القيم كاملةً من أول النصّ: قيمةٌ من خيارٍ لم يُستعمل، ثم الفاصل، ثم التالية،
 * حتى ينتهي النصّ مع آخر خيار. أي قراءةٍ تنجح تعني أن النصّ مجموعُ قيمٍ حقيقية
 * لا غير — فلا يصل إلى الطلب ولا إلى المسؤول نصٌّ لم يكتبه المسؤول نفسه.
 *
 * دالةٌ صافية؛ الرفض برسالته في `cartService.addItem`.
 */

/** الفاصل نفسه في التطبيق (`listSeparator` باللغتين) والمتجر. */
export const OPTION_VALUE_SEPARATOR = '، ';

/** حدود خيارات المنتج في لوحة التحكم (`validators/admin.ts`) — باللغتين. */
export const MAX_PRODUCT_OPTIONS = 10;
export const MAX_OPTION_NAME_LENGTH = 40;
export const MAX_OPTION_VALUES = 50;
export const MAX_OPTION_VALUE_LENGTH = 80;

/**
 * أطول `optionValue` يمكن أن يكون صالحاً: قيمةٌ بأقصى طول لكل خيار من أقصى
 * عددٍ منها، بينها الفواصل — ٨١٨ حرفاً.
 *
 * [CRITICAL] السقف مشتقٌّ من حدود اللوحة لا رقماً مستقلاً. كان مدقّق العربة
 * يقطع عند ٨٠ — طولِ قيمةٍ واحدة — فتركيبةٌ صحيحة من قيمتين طويلتين تُرفض
 * دائماً. وما فوقه لا يطابق أي منتجٍ تقبله اللوحة، فيُرفض قبل قراءة القاعدة
 * ولا يصل المطابِق نصٌّ أطول من هذا.
 */
export const MAX_OPTION_VALUE_TEXT_LENGTH =
  MAX_PRODUCT_OPTIONS * MAX_OPTION_VALUE_LENGTH + (MAX_PRODUCT_OPTIONS - 1) * OPTION_VALUE_SEPARATOR.length;

export interface ProductOptionValues {
  values: readonly string[];
  /** `[]` = لا ترجمة كردية (046). */
  valuesCkb: readonly string[];
}

/**
 * - `valid`: يُقبل كما أُرسل.
 * - `invalid`: للمنتج خيارات والنصّ لا يطابقها (أو غائب).
 * - `unexpected`: لا خيارات للمنتج وأُرسل نصّ.
 */
export type OptionValueVerdict = 'valid' | 'invalid' | 'unexpected';

export function checkOptionValue(
  optionValue: string | null,
  options: readonly ProductOptionValues[],
): OptionValueVerdict {
  if (options.length === 0) return optionValue === null ? 'valid' : 'unexpected';
  if (optionValue === null) return 'invalid';
  return matchesAllOptions(optionValue, options) ? 'valid' : 'invalid';
}

/**
 * حدّ عمل المسار البطيء ([readWholeValues]) بعدد مقارنات القيم.
 *
 * [CRITICAL] السقف ٨١٨ حرفاً (لا ٨٠) فتح باباً: قيمٌ تحوي «، » وتبدأ ببعضها
 * («أ»، «أ، أ»، «أ، أ، أ»…) في عشرة خيارات كانت تكلّف المطابِقَ ١١ ثانية من
 * المعالج لطلبٍ واحد. الحدّ يجعل أسوأ طلبٍ ملّيثوانيَ معدودة؛ ما يتجاوزه
 * يُرفض (`invalid`). وأثقلُ منتجٍ تقبله اللوحة في هذا المسار — عشرة خيارات،
 * خمسون قيمة عربية وخمسون كردية لكلٍّ بثمانين حرفاً، وقيمةٌ تحوي الفاصل —
 * يُحسم بخمسة آلاف وخمسمئة مقارنة حين لا تتشارك خياراته قيمها. خياراتٌ كثيرة
 * بقيمٍ مشتركة مع قيمةٍ تحوي الفاصل قد تستنفد الحدّ فتُرفض تركيبةٌ صحيحة —
 * إلا أن تُقرأ بالتقسيم أولاً ([assignSegments])، وهو حال كل تركيبةٍ لا
 * تستعمل القيمة ذات الفاصل.
 */
const MATCH_BUDGET = 20_000;

function matchesAllOptions(text: string, options: readonly ProductOptionValues[]): boolean {
  const choices = options.map((option) => [...new Set([...option.values, ...option.valuesCkb])]
    .filter((value) => value.length > 0));
  // التقسيم أولاً: إن أسندت قطعُه إلى الخيارات فالنصّ مجموعُ قيمٍ حقيقية مهما
  // احتوت قيمٌ أخرى الفاصل — والمطابقة الثنائية لا تنفد ميزانيتها حين تتشارك
  // خياراتٌ كثيرة قيمها. البحث المحدود لما لا يُقرأ إلا بقيمةٍ تحوي الفاصل.
  if (assignSegments(text.split(OPTION_VALUE_SEPARATOR), choices)) return true;
  if (choices.every((values) => values.every((value) => !value.includes(OPTION_VALUE_SEPARATOR)))) {
    return false;
  }
  return readWholeValues(text, choices);
}

/**
 * المسار المعتاد: حين لا قيمةَ تحوي الفاصل فحدود القيم هي مواضع الفاصل نفسها
 * والتقسيم حاسم، وإلا فنجاحه وحده حاسم (قراءةٌ صحيحة وُجدت). يبقى إسناد كل قطعة إلى خيارٍ مختلف تحويها قيمُه — مطابقةٌ
 * ثنائية (Kuhn) تحسمها في خطواتٍ معدودة حتى حين تتشارك الخيارات قيمها
 * («لون الإطار» و«لون العدسة» بالألوان نفسها)، فلا تجريب لكل ترتيب.
 */
function assignSegments(segments: readonly string[], choices: readonly (readonly string[])[]): boolean {
  if (segments.length !== choices.length) return false;
  const sets = choices.map((values) => new Set(values));
  /** `owner[o]` = القطعة المسندة إلى الخيار `o`، أو -1. */
  const owner = choices.map(() => -1);
  const assign = (segment: number, seen: boolean[]): boolean => {
    for (let o = 0; o < sets.length; o++) {
      if (seen[o] || !sets[o]!.has(segments[segment]!)) continue;
      seen[o] = true;
      if (owner[o] === -1 || assign(owner[o]!, seen)) {
        owner[o] = segment;
        return true;
      }
    }
    return false;
  };
  return segments.every((_, segment) => assign(segment, choices.map(() => false)));
}

/**
 * قيمةٌ تحوي «، » نفسها: لا تقسيم — تُستهلك القيم كاملةً من أول النصّ، قيمةٌ من
 * خيارٍ لم يُستعمل ثم الفاصل ثم التالية، حتى ينتهي النصّ مع آخر خيار. محدودٌ
 * بـ[MATCH_BUDGET].
 */
function readWholeValues(text: string, choices: readonly (readonly string[])[]): boolean {
  const used = choices.map(() => false);
  // حالاتٌ جُرّبت ففشلت (الموضع + الخيارات المستعملة): قيمٌ متشابهة البدايات
  // لا تُعيد التجربة نفسها مرةً بعد مرة.
  const failed = new Set<string>();
  let budget = MATCH_BUDGET;

  const readFrom = (position: number, remaining: number): boolean => {
    const state = `${position}:${used.map(Number).join('')}`;
    if (failed.has(state)) return false;
    for (let i = 0; i < choices.length; i++) {
      if (used[i]) continue;
      for (const value of choices[i]!) {
        if (budget-- <= 0) return false;
        if (!text.startsWith(value, position)) continue;
        const end = position + value.length;
        if (remaining === 1) {
          if (end === text.length) return true;
          continue;
        }
        if (!text.startsWith(OPTION_VALUE_SEPARATOR, end)) continue;
        used[i] = true;
        const matched = readFrom(end + OPTION_VALUE_SEPARATOR.length, remaining - 1);
        used[i] = false;
        if (matched) return true;
      }
    }
    failed.add(state);
    return false;
  };

  return readFrom(0, choices.length);
}
