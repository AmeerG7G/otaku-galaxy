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

function matchesAllOptions(text: string, options: readonly ProductOptionValues[]): boolean {
  const choices = options.map((option) => [...new Set([...option.values, ...option.valuesCkb])]
    .filter((value) => value.length > 0));
  const used = choices.map(() => false);
  // حالاتٌ جُرّبت ففشلت (الموضع + الخيارات المستعملة): قيمٌ متشابهة البدايات
  // لا تُعيد التجربة نفسها مرةً بعد مرة.
  const failed = new Set<string>();

  const readFrom = (position: number, remaining: number): boolean => {
    const state = `${position}:${used.map(Number).join('')}`;
    if (failed.has(state)) return false;
    for (let i = 0; i < choices.length; i++) {
      if (used[i]) continue;
      for (const value of choices[i]!) {
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
