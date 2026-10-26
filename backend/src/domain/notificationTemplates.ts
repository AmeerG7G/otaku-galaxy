import { DEFAULT_LOCALE, type AppLocale } from '../utils/locale.js';

/**
 * قوالب الإشعارات — مصدر النصّ الوحيد.
 *
 * [CRITICAL] كانت العناوين والنصوص مكتوبة حرفياً داخل خمس خدمات (الطلبات،
 * المزايا، الاستعادة، التقييمات، الإدارة). لغةٌ ثانية بهذا الشكل تعني نثر
 * سلاسل كردية في معالِجات المسارات، وأن ينسى موضعٌ واحد فيصل الزبونَ إشعارٌ
 * بالعربية بين إشعاراته الكردية. القالب هنا يجعل النسيان مستحيلاً: من يضيف
 * نوعاً جديداً يضيفه للّغتين أو لا يُصرِّف أصلاً.
 *
 * ⚠ الكردية (سوراني) **مسوّدة تنتظر مراجعة ناطق**. المعمارية جاهزة للإنتاج،
 * والنصّ الكردي يحتاج تدقيقاً لغوياً قبل الإطلاق. أي مفتاح يُصحَّح هنا وحده.
 *
 * ملاحظة الإدارة (`note`) لا تُترجَم ولا يجوز: يكتبها المسؤول بلغته لحالةٍ
 * بعينها (سبب الرفض، وقت الوصول المتوقّع)، وترجمتُها آلياً تحريفٌ لكلامه.
 */

/** المصطلحات الثابتة — مسرد يمنع تعدّد الترجمات للمفهوم الواحد. */
export const GLOSSARY = {
  order: { ar: 'طلب', ckb: 'داواکاری' },
  product: { ar: 'منتج', ckb: 'بەرهەم' },
  cart: { ar: 'سلة', ckb: 'سەبەتە' },
  points: { ar: 'نقاط المجرّة', ckb: 'خاڵەکانی گەلاکسی' },
  gift: { ar: 'هدية', ckb: 'دیاری' },
  discount: { ar: 'خصم', ckb: 'داشکاندن' },
  review: { ar: 'تقييم', ckb: 'هەڵسەنگاندن' },
  delivery: { ar: 'توصيل', ckb: 'گەیاندن' },
  category: { ar: 'قسم', ckb: 'بەش' },
  favorite: { ar: 'مفضلة', ckb: 'دڵخواز' },
  address: { ar: 'عنوان', ckb: 'ناونیشان' },
  stock: { ar: 'مخزون', ckb: 'کۆگا' },
  available: { ar: 'متوفر', ckb: 'بەردەست' },
  unavailable: { ar: 'غير متوفر', ckb: 'بەردەست نییە' },
  account: { ar: 'حساب', ckb: 'هەژمار' },
  settings: { ar: 'إعدادات', ckb: 'ڕێکخستنەکان' },
  notification: { ar: 'إشعار', ckb: 'ئاگادارکردنەوە' },
} as const;

/**
 * أسماء الشهور — الأرقام تبقى غربية دوماً (متطلَّب منتج صريح)، والمتغيّر
 * الاسمُ وحده. `Intl` بلغة `en-US` هو ما يولّد اليوم والشهر رقمياً في
 * `formatExpectedRestockDate`، فلا يمرّ رقمٌ عربيّ-هنديّ من هذا الطريق.
 */
export const MONTH_NAMES: Record<AppLocale, readonly string[]> = {
  ar: [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ],
  ckb: [
    'کانوونی دووەم', 'شوبات', 'ئازار', 'نیسان', 'ئایار', 'حوزەیران',
    'تەمووز', 'ئاب', 'ئەیلوول', 'تشرینی یەکەم', 'تشرینی دووەم', 'کانوونی یەکەم',
  ],
};

export interface NotificationText {
  title: string;
  body: string;
}

type Template = Record<AppLocale, NotificationText>;

/**
 * كل نصّ إشعارٍ في المنظومة. المفتاح ثابتٌ إنجليزي لا نصٌّ معروض — النصّ
 * يتغيّر بتغيّر الصياغة، والمفتاح لا.
 */
export const NOTIFICATION_TEMPLATES = {
  orderAccepted: {
    ar: {
      title: 'تم قبول طلبك 🎉',
      body: 'طلبك مقبول وقيد التجهيز، وراح يوصلك قريباً.',
    },
    ckb: {
      title: 'داواکارییەکەت وەرگیرا 🎉',
      body: 'داواکارییەکەت پەسەندکرا و لە ئامادەکردندایە، بەم زووانە پێت دەگات.',
    },
  },
  orderAcceptedDispatched: {
    ar: {
      title: 'تم قبول طلبك 🎉',
      body: 'طلبك مقبول وخرج للتوصيل — الدفع عند الاستلام.',
    },
    ckb: {
      title: 'داواکارییەکەت وەرگیرا 🎉',
      body: 'داواکارییەکەت پەسەندکرا و چووە ڕێگا بۆ گەیاندن — پارەدان لە کاتی وەرگرتن.',
    },
  },
  deliveryUpdate: {
    ar: {
      title: 'طلبك بالطريق 🚚',
      body: 'طلبك خرج للتوصيل — الدفع عند الاستلام.',
    },
    ckb: {
      title: 'داواکارییەکەت لە ڕێگادایە 🚚',
      body: 'داواکارییەکەت چووە ڕێگا بۆ گەیاندن — پارەدان لە کاتی وەرگرتن.',
    },
  },
  orderCompleted: {
    ar: {
      title: 'تم استلام طلبك',
      body: 'نتمنى المنتجات عجبتك — شاركنا رأيك واكسب نقاط المجرّة.',
    },
    ckb: {
      title: 'داواکارییەکەت وەرگیرا',
      body: 'هیوادارین بەرهەمەکان بەدڵت بن — ڕات لەگەڵمان بەشدار بکە و خاڵەکانی گەلاکسی بەدەست بهێنە.',
    },
  },
  orderRejected: {
    ar: {
      title: 'ما تم قبول طلبك',
      body: 'تكدر تتواصل ويانا أو تسوي طلب جديد.',
    },
    ckb: {
      title: 'داواکارییەکەت پەسەند نەکرا',
      body: 'دەتوانیت پەیوەندیمان پێوە بکەیت یان داواکارییەکی نوێ بنێریت.',
    },
  },
} as const satisfies Record<string, Template>;

/**
 * قوالب تحمل قيماً متغيّرة (اسم منتج، وصف مزيّة، تاريخ).
 *
 * دوالٌّ لا سلاسل: الترتيب النحوي يختلف بين اللغتين، ودمجُ القيمة في نصٍّ
 * ثابت بـ`replace` كان سيفرض ترتيب العربية على الكردية.
 */
export const PARAM_TEMPLATES = {
  rewardClaimedGift: {
    ar: (label: string) => ({
      title: 'سُجّلت هديتك 🎁',
      body: `${label}. سنتواصل معك لتسليمها.`,
    }),
    ckb: (label: string) => ({
      title: 'دیارییەکەت تۆمارکرا 🎁',
      body: `${label}. پەیوەندیت پێوە دەکەین بۆ گەیاندنی.`,
    }),
  },
  rewardClaimedDiscount: {
    ar: (label: string) => ({
      title: 'مزيّتك جاهزة 🎉',
      body: `${label}. سيُطبَّق تلقائياً على طلبك القادم.`,
    }),
    ckb: (label: string) => ({
      title: 'خاڵەکەت ئامادەیە 🎉',
      body: `${label}. بەشێوەی خۆکار بۆ داواکاری داهاتووت جێبەجێ دەکرێت.`,
    }),
  },
  rewardDelivered: {
    ar: (label: string) => ({
      title: 'سُلّمت هديتك 🎁',
      body: label ? `${label} — تم التسليم.` : 'تم تسليم هديتك.',
    }),
    ckb: (label: string) => ({
      title: 'دیارییەکەت گەیشت 🎁',
      body: label ? `${label} — گەیەنرا.` : 'دیارییەکەت گەیەنرا.',
    }),
  },
  backInStock: {
    ar: (product: string) => ({
      title: `«${product}» عاد للتوفر`,
      body: 'سارع قبل نفاد الكمية — المنتج متوفر من جديد.',
    }),
    ckb: (product: string) => ({
      title: `«${product}» گەڕایەوە بۆ بەردەستبوون`,
      body: 'پەلە بکە پێش تەواوبوونی — بەرهەمەکە دیسان بەردەستە.',
    }),
  },
  restockScheduled: {
    ar: (product: string, when: string) => ({
      title: 'موعد توفر المنتج',
      body: `«${product}» متوقّع توفره بتاريخ ${when}.`,
    }),
    ckb: (product: string, when: string) => ({
      title: 'کاتی بەردەستبوونی بەرهەم',
      body: `چاوەڕوان دەکرێت «${product}» لە ${when} بەردەست بێت.`,
    }),
  },
  restockRescheduled: {
    ar: (product: string, when: string) => ({
      title: 'تغيّر موعد التوفر',
      body: `تم تحديث موعد توفر «${product}» إلى ${when}.`,
    }),
    ckb: (product: string, when: string) => ({
      title: 'کاتی بەردەستبوون گۆڕا',
      body: `کاتی بەردەستبوونی «${product}» نوێکرایەوە بۆ ${when}.`,
    }),
  },
  reviewApproved: {
    ar: (product: string) => ({
      title: 'نُشر تقييمك 🎉',
      body: `تقييمك لـ«${product}» صار ظاهر للجميع. شكراً إلك.`,
    }),
    ckb: (product: string) => ({
      title: 'هەڵسەنگاندنەکەت بڵاوکرایەوە 🎉',
      body: `هەڵسەنگاندنەکەت بۆ «${product}» ئێستا بۆ هەمووان دیارە. سوپاس.`,
    }),
  },
  reviewRejected: {
    ar: () => ({
      title: 'تقييمك يحتاج تعديل',
      body: 'تكدر تعدّله وتعيد إرساله.',
    }),
    ckb: () => ({
      title: 'هەڵسەنگاندنەکەت پێویستی بە دەستکاری هەیە',
      body: 'دەتوانیت دەستکاری بکەیت و دووبارە بینێریتەوە.',
    }),
  },
} as const;

export type NotificationTemplateKey = keyof typeof NOTIFICATION_TEMPLATES;

/**
 * نصّ الإشعار بلغة صاحبه.
 *
 * `note` — إن وُجد — يحلّ محلّ الجسم لا يُضاف إليه: هو كلام المسؤول عن هذه
 * الحالة بعينها، وأدقّ من أي نصّ عام.
 */
export function renderNotification(
  key: NotificationTemplateKey,
  locale: AppLocale,
  note?: string | null,
): NotificationText {
  const template = NOTIFICATION_TEMPLATES[key];
  const text = template[locale] ?? template[DEFAULT_LOCALE];
  return {
    title: text.title,
    body: note && note.trim() !== '' ? note : text.body,
  };
}
