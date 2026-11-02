import type { ProductOptionInput } from '../types/products'

/** قيمة خيارٍ بلغتيها — صفٌّ واحد في النموذج، فتُحذف وتُنقل معاً. */
export interface OptionValueFields {
  ar: string
  ckb: string
}

export interface OptionFields {
  name: string
  nameCkb: string
  values: OptionValueFields[]
}

/** من الخادم إلى النموذج: الترجمة الناقصة حقولٌ فارغة لا نسخةٌ من العربية. */
export function optionsToFields(options: readonly ProductOptionInput[]): OptionFields[] {
  return options.map((option) => ({
    name: option.name,
    nameCkb: option.nameCkb ?? '',
    values: option.values.map((ar, index) => ({ ar, ckb: option.valuesCkb?.[index] ?? '' })),
  }))
}

/**
 * من النموذج إلى الخادم — الحقلان الكرديان **صريحان دائماً**.
 *
 * [CRITICAL] الخادم يُبقي الترجمة المحفوظة حين يغيب الحقل، ويكتب ما يصله حين
 * يحضر: `null`/`[]` إفراغٌ مقصود. النموذج يعرض الترجمة كما حُفظت، فما يرسله
 * هو ما يراه المسؤول — حتى إفراغ حقلٍ عمداً.
 */
export function optionsFromFields(fields: readonly OptionFields[]): ProductOptionInput[] {
  return fields.map((option) => {
    const valuesCkb = option.values.map((value) => (value.ckb ?? '').trim())
    return {
      name: (option.name ?? '').trim(),
      nameCkb: (option.nameCkb ?? '').trim() || null,
      values: option.values.map((value) => (value.ar ?? '').trim()),
      valuesCkb: valuesCkb.every((value) => value === '') ? [] : valuesCkb,
    }
  })
}
