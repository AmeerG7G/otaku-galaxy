import {
  pickLocalized,
  pickLocalizedEither,
  pickLocalizedList,
  type AppLocale,
} from './locale.js';

/**
 * حسم `name`/`description` للمنتج بلغة الطلب — مع إبقاء اللغتين صريحتين.
 *
 * [CRITICAL] محتوى المنتج استثناءٌ مقصود من قاعدة «لغة واحدة محسومة» التي
 * تحكم الأقسام والخيارات والمحافظات أدناه (066):
 *   • `name`/`description` محسومان هنا بلغة الطلب — لعميلٍ أقدم لا يعرف غيرهما.
 *   • `nameAr`/`descriptionAr`/`nameCkb`/`descriptionCkb` تخرج كما هي
 *     (`null` = ناقص) لأن التطبيق يحتفظ بالمنتج في السلة والمفضلة وتفاصيل
 *     الطلب وقوائم مفتوحة، ثم يبدّل الزبون اللغة — فيجب أن يعيد الاختيار من
 *     البيانات التي عنده بلا جلبٍ ثانٍ، وأن يعرف أن الكردية **ناقصة** بدل أن
 *     يعرض العربية على أنها كردية.
 * الاختيار في التطبيق يتبع القاعدة نفسها ([pickLocalized]: كرديٌّ حاضر وإلا
 * العربي) — `name` هنا يساوي اختيارَه دائماً، ويحرس ذلك
 * `bilingual-product-content.test.ts`.
 */
export function localizeProduct<
  T extends {
    name: string;
    description: string;
    nameAr: string;
    descriptionAr: string;
    nameCkb: string | null;
    descriptionCkb: string | null;
  },
>(product: T, locale: AppLocale): T {
  return {
    ...product,
    name: pickLocalized(product.nameAr, product.nameCkb, locale),
    description: pickLocalized(product.descriptionAr, product.descriptionCkb, locale),
  };
}

/** لكل ما ليس له إلا اسم: الأقسام، الأقسام الفرعية، المحافظات، المناطق. */
export function localizeNamed<
  T extends { name: string; nameCkb?: string | null },
>(entity: T, locale: AppLocale): Omit<T, 'nameCkb'> {
  const { nameCkb, ...rest } = entity;
  return { ...rest, name: pickLocalized(entity.name, nameCkb, locale) };
}

/**
 * البنر: عنوانه وسطره الثاني بلغة الطلب — مع إبقاء اللغتين صريحتين (067).
 *
 * [CRITICAL] استثناءٌ مقصود من «لغة واحدة محسومة»، كالمنتج ([localizeProduct]):
 *   • `title`/`subtitle` محسومان هنا — لعميلٍ أقدم لا يعرف غيرهما.
 *   • `titleAr`/`subtitleAr`/`titleCkb`/`subtitleCkb` تخرج كما هي (`null` =
 *     لا نصّ بتلك اللغة)، فيختار التطبيق بلغة واجهته الآن بلا جلبٍ ثانٍ.
 * والاختيار متناظر ([pickLocalizedEither]) لأن نصّ البنر اختياريٌّ باللغتين:
 * الكردية الناقصة تُعرض عربيةً، والعربية الناقصة تُعرض كرديةً. التطبيق يتبع
 * القاعدة نفسها (`pickEitherLanguage`) — `title` هنا يساوي اختيارَه دائماً.
 */
export function localizeBanner<
  T extends {
    title: string | null;
    subtitle: string;
    titleAr: string | null;
    subtitleAr: string | null;
    titleCkb: string | null;
    subtitleCkb: string | null;
  },
>(banner: T, locale: AppLocale): T {
  return {
    ...banner,
    title: pickLocalizedEither(banner.titleAr, banner.titleCkb, locale),
    subtitle: pickLocalizedEither(banner.subtitleAr, banner.subtitleCkb, locale) ?? '',
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
