import { pickLocalized, pickLocalizedList, type AppLocale } from './locale.js';

/**
 * حسم لغة الحقول المترجَمة قبل خروجها إلى الزبون.
 *
 * [CRITICAL] المستودعات تُخرج اللغتين معاً (`name` + `nameCkb`) لأن لوحة
 * التحكم تحرّر الاثنين. الزبون يجب ألّا يرى إلا واحدة محسومة: تركُ الحقلين
 * في ردّه يعني أن التطبيق هو من «يخمّن» أي حقلٍ يعرض — وهو بالضبط ما تمنعه
 * هذه الطبقة. الحقول الكردية تُحذف من الردّ بعد الحسم فلا يبقى ما يُخمَّن.
 */
export function localizeProduct<
  T extends {
    name: string;
    description: string;
    nameCkb?: string | null;
    descriptionCkb?: string | null;
  },
>(product: T, locale: AppLocale): Omit<T, 'nameCkb' | 'descriptionCkb'> {
  const { nameCkb, descriptionCkb, ...rest } = product;
  return {
    ...rest,
    name: pickLocalized(product.name, nameCkb, locale),
    description: pickLocalized(product.description, descriptionCkb, locale),
  };
}

/** نظيره لكل ما ليس له إلا اسم: الأقسام، الأقسام الفرعية، المحافظات، المناطق. */
export function localizeNamed<
  T extends { name: string; nameCkb?: string | null },
>(entity: T, locale: AppLocale): Omit<T, 'nameCkb'> {
  const { nameCkb, ...rest } = entity;
  return { ...rest, name: pickLocalized(entity.name, nameCkb, locale) };
}

/** البنر: عنوانه وحده نصٌّ يراه الزبون. */
export function localizeBanner<
  T extends { title: string | null; titleCkb?: string | null },
>(banner: T, locale: AppLocale): Omit<T, 'titleCkb'> {
  const { titleCkb, ...rest } = banner;
  return {
    ...rest,
    title: banner.title === null ? null : pickLocalized(banner.title, titleCkb, locale),
  };
}

/** خيار المنتج: اسم المجموعة وقيمها معاً، أو العربية كاملةً. */
export function localizeOption<
  T extends {
    name: string;
    values: string[];
    nameCkb?: string | null;
    valuesCkb?: string[] | null;
  },
>(option: T, locale: AppLocale): Omit<T, 'nameCkb' | 'valuesCkb'> {
  const { nameCkb, valuesCkb, ...rest } = option;
  return {
    ...rest,
    name: pickLocalized(option.name, nameCkb, locale),
    values: pickLocalizedList(option.values, valuesCkb, locale),
  };
}
