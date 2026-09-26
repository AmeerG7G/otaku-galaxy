/**
 * قواعد نقاط المجرّة — مصدر الحقيقة الوحيد.
 *
 * [CRITICAL] هذه قواعد **ثابتة** لا إعدادات. كانت قيم المنح تُقرأ من
 * `store_settings` ويعدّلها المسؤول من اللوحة، وكان سلّم المستويات جدولاً
 * كامل الصلاحيات (`loyalty_levels`) — فصار الرقم الذي يراه الزبون في شاشته
 * رهيناً بمن فتح اللوحة آخر مرة. القرار التجاري الآن مثبَّت: نقاطُ الشراء
 * والتقييم والسلّم ومزاياه لا تُضبط من أي واجهة، وأي محاولة لجعلها قابلة
 * للضبط تُعيد إنتاج نفس العطل.
 *
 * الملف بلا إدخال/إخراج عمداً: دوالٌّ صرفة وثوابت. من يحتاج قاعدةً يستوردها
 * من هنا ولا يعيد اشتقاقها — تعريفٌ ثانٍ لـ«كم نقطة لكل عشرة آلاف» هو
 * تعريفان يتباعدان.
 */

// ═══════════════ نقاط الشراء ═══════════════

/** كل ١٠٬٠٠٠ دينار من قيمة الشراء المؤهَّلة تمنح ٥ نقاط. */
export const PURCHASE_STEP_IQD = 10_000;
export const PURCHASE_POINTS_PER_STEP = 5;

/**
 * قيمة الشراء المؤهَّلة = مجموع المنتجات ناقص الخصومات المطبَّقة عليها.
 *
 * ما يدخل: `products_total` (مجموع أسطر المنتجات وقت الطلب).
 * ما يُطرح: `discount` (خصم الميلاد + خصم مزيّة المستوى) — الزبون لم يدفعه.
 * ما لا يدخل إطلاقاً: رسوم التوصيل وخصمها. التوصيل خدمةٌ لا شراء، ومنحُ
 * نقاطٍ عليه يكافئ سكنى المحافظة البعيدة لا الشراء.
 *
 * طرحُ الخصم يغلق باباً أوسع: خصمُ المزيّة نفسه مُموَّلٌ بالنقاط، فلو دخل في
 * الحساب لأنتجت النقاطُ نقاطاً — حلقة تُغذّي نفسها.
 */
export function eligiblePurchaseValue(order: {
  productsTotal: number;
  discount: number;
}): number {
  return Math.max(0, order.productsTotal - order.discount);
}

/**
 * نقاط الشراء لقيمة مؤهَّلة.
 *
 * القسمة نازلة (`floor`) والباقي **يُهمَل ولا يُرحَّل**: ٩٩٬٩٩٩ ديناراً تمنح
 * ٤٥ نقطة لا ٥٠، ولا يُحفظ الباقي لطلبٍ لاحق. الترحيل كان سيتطلب رصيداً
 * ثانياً غير الدفتر يتذكّر الكسور، وهو بالضبط نوعُ الحالة المزدوجة التي
 * يتجنّبها هذا النظام (الرصيد مجموع الدفتر لا غير).
 */
export function purchasePointsFor(eligibleValue: number): number {
  if (!Number.isFinite(eligibleValue) || eligibleValue <= 0) return 0;
  return Math.floor(eligibleValue / PURCHASE_STEP_IQD) * PURCHASE_POINTS_PER_STEP;
}

// ═══════════════ نقاط التقييم ═══════════════

/** تعليق مكتوب مؤهَّل. */
export const REVIEW_COMMENT_POINTS = 1;

/**
 * مكافأة الصور — **مقطوعة** لا لكل صورة.
 *
 * صورةٌ واحدة وخمسُ صور تمنحان ٥ نقاط سواءً بسواء. الغرض تشجيع إرفاق صورة
 * أصلاً، لا شراء النقاط بتكرار اللقطة نفسها خمس مرات.
 */
export const REVIEW_PHOTOS_POINTS = 5;

/** أقصى عدد صور في التقييم الواحد — يفرضه الخادم والقاعدة معاً. */
export const MAX_REVIEW_PHOTOS = 5;

/** أقصى مكافأة لتقييم واحد مؤهَّل (تعليق + صور). */
export const MAX_REVIEW_POINTS = REVIEW_COMMENT_POINTS + REVIEW_PHOTOS_POINTS;

/**
 * سقف نقاط التقييم لكل طلب.
 *
 * بدونه يشتري أحدهم عشرين قطعة رخيصة في طلب واحد ويحصد ١٢٠ نقطة من
 * التقييمات وحدها — أي أن قيمة الطلب تصير بلا علاقة بما يُمنح. نقاط الشراء
 * خارج هذا السقف تماماً: هي وحدها من يقيس قيمة الطلب.
 */
export const REVIEW_POINTS_CAP_PER_ORDER = 20;

export interface ReviewAward {
  /** نقاط التعليق المكتوب (٠ أو ١). */
  comment: number;
  /** مكافأة الصور المقطوعة (٠ أو ٥). */
  photos: number;
  /** المجموع قبل تطبيق سقف الطلب. */
  total: number;
}

/**
 * ما يستحقّه تقييمٌ اعتُمد — قبل سقف الطلب.
 *
 * التعليق والصور يتجمّعان ولا يتبادلان: كان النظام يمنح إمّا نقطةً وإمّا
 * خمساً، فالتقييم المصوّر المكتوب كان يخسر نقطة التعليق بلا سبب مفهوم.
 */
export function reviewPointsFor(input: {
  hasComment: boolean;
  photoCount: number;
}): ReviewAward {
  const comment = input.hasComment ? REVIEW_COMMENT_POINTS : 0;
  const photos = input.photoCount > 0 ? REVIEW_PHOTOS_POINTS : 0;
  return { comment, photos, total: comment + photos };
}

/** هل التعليق مؤهَّل للنقطة؟ الفراغ ليس رأياً. */
export function isQualifyingComment(comment: string | null | undefined): boolean {
  return Boolean(comment && comment.trim().length > 0);
}

// ═══════════════ سلّم المستويات ═══════════════

/** مفاتيح المستويات — مستقرة وإنجليزية، تُستعمل في القاعدة والـAPI. */
export const GALAXY_LEVEL_KEYS = [
  'beginner',
  'explorer',
  'voyager',
  'warrior',
  'champion',
  'star',
  'legend',
] as const;

export type GalaxyLevelKey = (typeof GALAXY_LEVEL_KEYS)[number];

export type RewardKind = 'none' | 'discount' | 'gift';

export interface DiscountReward {
  kind: 'discount';
  /** نسبة الخصم من مجموع المنتجات. */
  percent: number;
  /** سقف الخصم بالدينار — النسبة لا تتجاوزه مهما كبر الطلب. */
  capAmount: number;
}

export interface GiftReward {
  kind: 'gift';
  /** قيمة الهدية بالدينار — ثابتة لا تُضبط. */
  giftAmount: number;
}

export interface NoReward {
  kind: 'none';
}

export type LevelReward = DiscountReward | GiftReward | NoReward;

export interface GalaxyLevel {
  key: GalaxyLevelKey;
  /** رقم المستوى المعروض (١..٧) — مشتقٌّ من الموضع لا عمود مستقل. */
  number: number;
  requiredPoints: number;
  /**
   * صيغتا الاسم العربيتان.
   *
   * ترسل الواجهةُ الصيغتين معاً ويختار العميلُ بحسب جنس صاحب الحساب. الاسم
   * نصُّ عرضٍ لا معرّف: المنطق كلّه يمرّ على `key`.
   */
  nameMale: string;
  nameFemale: string;
  /**
   * الاسم بالكردية (سوراني) — **صيغة واحدة**.
   *
   * [CRITICAL] السوراني لا يصرّف الاسم بجنس صاحبه كما تفعل العربية
   * («بطل/بطلة»)، فصيغةٌ واحدة تخاطب الجميع — بنفس قرار `Gendered.ckb` في
   * التطبيق. كانت الأسماء عربيةً وحدها فظهر «مستكشف المجرة» في واجهةٍ
   * كردية. ⚠ مسوّدة تنتظر مراجعة ناطق.
   */
  nameCkb: string;
  /**
   * صيغة محايدة لمن لم يحدّد جنسه بعد.
   *
   * ليست الصيغةَ المذكّرة مكرَّرة: استعمالُ المذكّر لمن نجهل جنسه يخاطب
   * نصف الزبائن بصيغة ليست لهم لمجرّد أنهم لم يُسألوا بعد. البديل يصف
   * **المستوى** لا صاحبَه، فيصحّ للجميع بلا افتراض.
   */
  nameNeutral: string;
  reward: LevelReward;
  /** وصف المزيّة للعرض — مشتقّ، لا مصدر حقيقة. */
  rewardLabel: string;
  /** وصف المزيّة بالكردية — يُختار بلغة صاحب الحساب في الإشعارات والشاشة. */
  rewardLabelCkb: string;
}

/**
 * السلّم الثابت — سبعة مستويات، لا شارات.
 *
 * «رحّالة» و«أسطورة» لا تتغيّران بالجنس في العربية الفصحى، فتبقى الصيغتان
 * متطابقتين عمداً. الاشتقاق الآلي (إضافة تاء لكل اسم) كان سينتج «أسطورةة».
 */
export const GALAXY_LEVELS: readonly GalaxyLevel[] = [
  {
    key: 'beginner',
    number: 1,
    requiredPoints: 0,
    nameMale: 'مبتدئ المجرة',
    nameFemale: 'مبتدئة المجرة',
    nameNeutral: 'المستوى المبتدئ',
    nameCkb: 'سەرەتایی گەلاکسی',
    reward: { kind: 'none' },
    rewardLabel: 'بداية الرحلة',
    rewardLabelCkb: 'دەستپێکی گەشت',
  },
  {
    key: 'explorer',
    number: 2,
    requiredPoints: 100,
    nameMale: 'مستكشف المجرة',
    nameFemale: 'مستكشفة المجرة',
    nameNeutral: 'مستوى الاستكشاف',
    nameCkb: 'گەڕیدەی گەلاکسی',
    reward: { kind: 'discount', percent: 3, capAmount: 5_000 },
    rewardLabel: 'خصم ٣٪ — مرة واحدة',
    rewardLabelCkb: 'داشکاندنی 3٪ — یەک جار',
  },
  {
    key: 'voyager',
    number: 3,
    requiredPoints: 250,
    nameMale: 'رحّالة المجرة',
    nameFemale: 'رحّالة المجرة',
    nameNeutral: 'مستوى الترحال',
    nameCkb: 'گەشتیاری گەلاکسی',
    reward: { kind: 'gift', giftAmount: 5_000 },
    rewardLabel: 'هدية من المتجر بقيمة ٥٬٠٠٠ دينار — مرة واحدة',
    rewardLabelCkb: 'دیاری لە فرۆشگاوە بە بڕی 5,000 دینار — یەک جار',
  },
  {
    key: 'warrior',
    number: 4,
    requiredPoints: 400,
    nameMale: 'محارب المجرة',
    nameFemale: 'محاربة المجرة',
    nameNeutral: 'مستوى القتال',
    nameCkb: 'جەنگاوەری گەلاکسی',
    reward: { kind: 'discount', percent: 5, capAmount: 10_000 },
    rewardLabel: 'خصم ٥٪ — مرة واحدة',
    rewardLabelCkb: 'داشکاندنی 5٪ — یەک جار',
  },
  {
    key: 'champion',
    number: 5,
    requiredPoints: 600,
    nameMale: 'بطل المجرة',
    nameFemale: 'بطلة المجرة',
    nameNeutral: 'مستوى البطولة',
    nameCkb: 'پاڵەوانی گەلاکسی',
    reward: { kind: 'gift', giftAmount: 10_000 },
    rewardLabel: 'هدية من المتجر بقيمة ١٠٬٠٠٠ دينار — مرة واحدة',
    rewardLabelCkb: 'دیاری لە فرۆشگاوە بە بڕی 10,000 دینار — یەک جار',
  },
  {
    key: 'star',
    number: 6,
    requiredPoints: 800,
    nameMale: 'نجم المجرة',
    nameFemale: 'نجمة المجرة',
    nameNeutral: 'مستوى النجومية',
    nameCkb: 'ئەستێرەی گەلاکسی',
    reward: { kind: 'discount', percent: 10, capAmount: 20_000 },
    rewardLabel: 'خصم ١٠٪ — مرة واحدة',
    rewardLabelCkb: 'داشکاندنی 10٪ — یەک جار',
  },
  {
    key: 'legend',
    number: 7,
    requiredPoints: 1_000,
    nameMale: 'أسطورة المجرة',
    nameFemale: 'أسطورة المجرة',
    nameNeutral: 'مستوى الأسطورة',
    nameCkb: 'ئەفسانەی گەلاکسی',
    reward: { kind: 'gift', giftAmount: 25_000 },
    rewardLabel: 'هدية من المتجر بقيمة ٢٥٬٠٠٠ دينار — مرة واحدة',
    rewardLabelCkb: 'دیاری لە فرۆشگاوە بە بڕی 25,000 دینار — یەک جار',
  },
] as const;

/** وصف المزيّة بلغة صاحب الحساب — الكردية إن وُجدت وإلّا العربية. */
export function rewardLabelFor(level: GalaxyLevel, locale: 'ar' | 'ckb'): string {
  return locale === 'ckb' && level.rewardLabelCkb.trim() ? level.rewardLabelCkb : level.rewardLabel;
}

const LEVEL_BY_KEY = new Map<GalaxyLevelKey, GalaxyLevel>(
  GALAXY_LEVELS.map((level) => [level.key, level]),
);

export function findLevel(key: string): GalaxyLevel | null {
  return LEVEL_BY_KEY.get(key as GalaxyLevelKey) ?? null;
}

/** المستويات التي تحمل مزيّة قابلة للمطالبة (كل شيء عدا المستوى صفر). */
export const CLAIMABLE_LEVELS = GALAXY_LEVELS.filter(
  (level) => level.reward.kind !== 'none',
);

/**
 * موضع الزبون على السلّم.
 *
 * كان يُحسب في `OtakuLevel.forPoints` داخل تطبيق فلاتر، ثم انتقل إلى
 * `loyaltyRepo` مع الجدول. هو الآن هنا مع بقية القواعد: السلّم ثابتٌ في
 * الشيفرة، فلا معنى لبقاء حسابه في طبقة المستودعات.
 */
export function placeOnLadder(balance: number) {
  let index = 0;
  for (let i = 0; i < GALAXY_LEVELS.length; i += 1) {
    if (balance >= GALAXY_LEVELS[i]!.requiredPoints) index = i;
  }
  const current = GALAXY_LEVELS[index]!;
  const next = GALAXY_LEVELS[index + 1] ?? null;
  if (!next) {
    return { current, next: null, pointsToNext: 0, progress: 1 };
  }

  const span = next.requiredPoints - current.requiredPoints;
  const done = span <= 0 ? 1 : (balance - current.requiredPoints) / span;
  return {
    current,
    next,
    pointsToNext: Math.max(0, next.requiredPoints - balance),
    progress: Math.min(1, Math.max(0, done)),
  };
}

/**
 * قيمة خصم المزيّة على مجموع منتجات.
 *
 * السقف يُطبَّق بعد النسبة دائماً: ١٠٪ من مليون دينار هي ١٠٠٬٠٠٠، والمزيّة
 * تعطي ٢٠٬٠٠٠ لا غير. التقريب نازل حتى لا يُنشئ الكسرُ ديناراً من العدم.
 */
export function discountRewardAmount(
  reward: DiscountReward,
  productsTotal: number,
): number {
  if (!Number.isFinite(productsTotal) || productsTotal <= 0) return 0;
  const raw = Math.floor((productsTotal * reward.percent) / 100);
  return Math.max(0, Math.min(raw, reward.capAmount));
}
