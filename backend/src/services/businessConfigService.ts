import { db } from '../database/pool.js';
import {
  BUSINESS_SETTING_KEYS,
  settingsRepo,
  type BusinessSettingKey,
} from '../repositories/settingsRepo.js';
import {
  BIRTHDAY_DISCOUNT_PERCENT,
  POINTS_AWARDS,
} from '../types/index.js';
import { config } from '../config/index.js';
import { Errors } from '../utils/errors.js';

/**
 * إعدادات الأعمال — القيم التجارية التي يضبطها صاحب المتجر.
 *
 * لماذا طبقة فوق `store_settings` بدل القراءة المباشرة: القيمة في القاعدة
 * نصّ، وقد تكون غائبة أو فارغة أو فاسدة (حرّرها أحدهم يدوياً). القارئ
 * يحتاج رقماً صالحاً دائماً، لا `NaN` يتسلّل إلى حساب طلب. هذا الملف هو
 * المكان الوحيد الذي يحدث فيه التحويل والتحقق والرجوع إلى الافتراضي.
 *
 * [CRITICAL] الافتراضي هو **قيمة الإنتاج الحالية** المخبوزة في الكود. ما دام
 * الإعداد غير مضبوط، سلوك المنظومة بعد هذه الترقية مطابق لما قبلها تماماً.
 */

export interface BusinessSettingSpec {
  key: BusinessSettingKey;
  /** القيمة المستعملة حين لا يضبط المسؤول شيئاً — قيمة الإنتاج الحالية. */
  fallback: number;
  min: number;
  max: number;
  /** أعداد صحيحة فقط؟ (النقاط والساعات نعم؛ لا كسور فيها.) */
  integer: boolean;
  label: string;
  description: string;
  unit: string;
}

/**
 * المواصفات — مصدر الحقيقة الوحيد لكل ما يخصّ إعدادات الأعمال: الافتراضي،
 * المدى المسموح، والوصف الذي تعرضه لوحة التحكم. إضافة إعداد جديد تحدث هنا
 * وحدها، فلا تتباعد قائمة الواجهة عن قائمة التحقق.
 */
export const BUSINESS_SETTINGS: readonly BusinessSettingSpec[] = [
  {
    key: 'points_order_received',
    fallback: POINTS_AWARDS.orderReceived,
    min: 0,
    max: 10_000,
    integer: true,
    label: 'نقاط استلام الطلب',
    description: 'تُمنح مرة واحدة لكل طلب عند تأكيد الاستلام.',
    unit: 'نقطة',
  },
  {
    key: 'points_review_approved',
    fallback: POINTS_AWARDS.reviewApproved,
    min: 0,
    max: 10_000,
    integer: true,
    label: 'نقاط التقييم المعتمد',
    description: 'تُمنح عند اعتماد تقييم بلا صورة.',
    unit: 'نقطة',
  },
  {
    key: 'points_review_with_photo',
    fallback: POINTS_AWARDS.reviewWithPhoto,
    min: 0,
    max: 10_000,
    integer: true,
    label: 'نقاط التقييم مع صورة',
    description: 'تُمنح عند اعتماد تقييم مرفق بصورة.',
    unit: 'نقطة',
  },
  {
    key: 'birthday_discount_percent',
    fallback: BIRTHDAY_DISCOUNT_PERCENT,
    min: 0,
    max: 100,
    integer: true,
    label: 'نسبة خصم عيد الميلاد',
    description: 'تُطبَّق مرة واحدة في السنة على مجموع المنتجات.',
    unit: '٪',
  },
  {
    key: 'order_rating_delay_hours',
    fallback: config.orders.ratingDelayHours,
    min: 0,
    max: 24 * 30,
    integer: true,
    label: 'مهلة فتح التقييم',
    description:
      'تُحتسب من خروج الطلب للتوصيل. تسري على الطلبات الجديدة فقط — الطلبات القائمة تحتفظ بموعدها.',
    unit: 'ساعة',
  },
] as const;

const SPEC_BY_KEY = new Map<BusinessSettingKey, BusinessSettingSpec>(
  BUSINESS_SETTINGS.map((spec) => [spec.key, spec]),
);

export type BusinessConfig = Record<BusinessSettingKey, number>;

/**
 * تحويل القيمة المخزَّنة إلى رقم صالح، أو الرجوع إلى الافتراضي.
 *
 * الرجوع صامت عمداً: قيمة فاسدة في القاعدة يجب ألا تُسقط طلباً ولا تُعطّل
 * منح النقاط. القيمة الفاسدة تُعرَض للمسؤول في لوحة التحكم على أنها «غير
 * مضبوطة»، وهو المكان الصحيح لاكتشافها.
 */
function coerce(spec: BusinessSettingSpec, raw: string | undefined): number {
  const trimmed = raw?.trim();
  if (!trimmed) return spec.fallback;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return spec.fallback;
  if (spec.integer && !Number.isInteger(parsed)) return spec.fallback;
  if (parsed < spec.min || parsed > spec.max) return spec.fallback;
  return parsed;
}

export const businessConfigService = {
  /**
   * القيم الفعّالة الآن.
   *
   * تُقرأ عند كل استعمال لا مرة واحدة عند الإقلاع: تغيير الإعداد من لوحة
   * التحكم يجب أن يسري على الجائزة التالية بلا إعادة تشغيل الخادم.
   */
  async current(): Promise<BusinessConfig> {
    const stored = await settingsRepo.getAll(db);
    const result = {} as BusinessConfig;
    for (const spec of BUSINESS_SETTINGS) {
      result[spec.key] = coerce(spec, stored[spec.key]);
    }
    return result;
  },

  /** قيمة إعداد واحد — للمسارات التي تحتاج رقماً واحداً فقط. */
  async value(key: BusinessSettingKey): Promise<number> {
    const spec = SPEC_BY_KEY.get(key)!;
    const stored = await settingsRepo.getAll(db);
    return coerce(spec, stored[key]);
  },

  /**
   * وصف كامل لكل إعداد للوحة التحكم: القيمة الخام كما حُفظت، القيمة
   * الفعّالة، والافتراضي والمدى. المسؤول يحتاج التمييز بين «مضبوط على ٢٠»
   * و«غير مضبوط فيعمل بـ٢٠».
   */
  async describe() {
    const stored = await settingsRepo.getAll(db);
    return BUSINESS_SETTINGS.map((spec) => {
      const raw = stored[spec.key]?.trim() ?? '';
      const effective = coerce(spec, raw);
      return {
        key: spec.key,
        label: spec.label,
        description: spec.description,
        unit: spec.unit,
        value: raw === '' ? null : raw,
        effectiveValue: effective,
        defaultValue: spec.fallback,
        min: spec.min,
        max: spec.max,
        integer: spec.integer,
        /** هل القيمة المحفوظة مرفوضة ويعمل النظام بالافتراضي رغماً عنها؟ */
        usingDefault: raw === '' || effective !== Number(raw),
      };
    });
  },

  /**
   * حفظ إعدادات الأعمال.
   *
   * التحقق هنا **يرفض** بدل أن يرجع للافتراضي بصمت: المسؤول الذي كتب قيمة
   * خاطئة يجب أن يرى الرفض فوراً، لا أن يظن أنه حفظ ٥٠٠٪ خصماً بينما
   * النظام تجاهله. (الرجوع الصامت في `coerce` لحالة أخرى: بيانات فاسدة
   * وصلت للقاعدة من خارج هذا المسار.)
   *
   * إفراغ القيمة (سلسلة فارغة أو null) يعني «عُد إلى الافتراضي» — وهي
   * عملية مشروعة يحتاجها من غيّر ثم ندم.
   */
  async update(values: Partial<Record<BusinessSettingKey, string | number | null>>) {
    const toWrite: Partial<Record<BusinessSettingKey, string>> = {};

    for (const [key, rawValue] of Object.entries(values)) {
      const spec = SPEC_BY_KEY.get(key as BusinessSettingKey);
      if (!spec) continue;

      // الإفراغ = العودة للافتراضي.
      if (rawValue === null || rawValue === undefined || String(rawValue).trim() === '') {
        toWrite[spec.key] = '';
        continue;
      }

      const parsed = Number(String(rawValue).trim());
      if (!Number.isFinite(parsed)) {
        throw Errors.validation(`«${spec.label}»: القيمة يجب أن تكون رقماً`);
      }
      if (spec.integer && !Number.isInteger(parsed)) {
        throw Errors.validation(`«${spec.label}»: القيمة يجب أن تكون عدداً صحيحاً`);
      }
      if (parsed < spec.min || parsed > spec.max) {
        throw Errors.validation(
          `«${spec.label}»: القيمة يجب أن تكون بين ${spec.min} و${spec.max}`,
        );
      }
      toWrite[spec.key] = String(parsed);
    }

    if (Object.keys(toWrite).length > 0) {
      await settingsRepo.setMany(db, toWrite);
    }
    return this.describe();
  },
};
