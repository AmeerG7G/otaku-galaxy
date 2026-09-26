import type pg from 'pg';
import type { AppLocale } from '../utils/locale.js';
import { userRepo } from '../repositories/userRepo.js';
import { MONTH_NAMES, PARAM_TEMPLATES } from '../domain/notificationTemplates.js';
import { db, withTransaction } from '../database/pool.js';
import { productRepo } from '../repositories/catalogRepo.js';
import { notificationRepo } from '../repositories/notificationsRepo.js';
import { restockRepo } from '../repositories/restockRepo.js';
import { config } from '../config/index.js';
import { Errors } from '../utils/errors.js';

/**
 * «أخبرني عند توفره» — منطق الاشتراك والإعلام.
 *
 * المسارات كلها تعمل على صاحب الجلسة ([requireAuthentication] أعلنها في
 * التوجيه)، فلا ملكية لتسجيلها هنا. الإشعار عند عودة التوفر يجري داخل
 * معاملة تحديث المنتج نفسها: إمّا أن يُسجَّل المخزون الجديد مع إشعاراته
 * وفراغ اشتراكاته أو لا يُسجَّل شيء.
 */
export const restockService = {
  /** اشتراك بمنتج نافد المخزون — مكرَّر آمن وقابل للتكرار.
   *
   * الاشتراك يعني «نبّهني عند عودة المخزون»؛ لذلك يُرفض على المنتج المتوفر
   * لأن الحاجة لم تنشأ أصلاً — طلبٌ بلا معنى يتحول إلى خطأ واضح لا صمت.
   */
  async subscribe(userId: string, productId: string) {
    return withTransaction(async (tx) => {
      // [CRITICAL] «متوفر؟» يُقرأ بعد `FOR SHARE` على صفّ المنتج. قراءةٌ بلا قفل
      // كانت تسابق عودة المخزون: حفظ المسؤول (`FOR UPDATE`) أو رفضُ طلبٍ مقبول
      // (`UPDATE` = NO KEY UPDATE، لا يحجب المفتاح الأجنبي للاشتراك) يُرجع
      // القطعة ويستهلك المشتركين، والاشتراك الذي قرأ صفراً قبل التزامه يُدرج
      // بعده — فيبقى على منتجٍ متوفر بلا إشعار، أو يمسحه `clearForProduct` بلا
      // إشعار (CA-17a، STEP 57). `FOR SHARE` يتعارض مع القفلين كليهما: الاشتراك
      // ينتظر، ثم يرى المخزون العائد فيُرفض بـ`PRODUCT_IN_STOCK` كما لو وصل بعده.
      await tx.query('SELECT id FROM products WHERE id = $1 FOR SHARE', [productId]);
      const product = await productRepo.findById(tx, productId);
      if (!product) throw Errors.notFound('المنتج غير موجود');

      if (Number(product.stock) > 0) {
        throw Errors.conflict(
          'المنتج متوفر حالياً — لا حاجة لإشعار عند توفره',
          'PRODUCT_IN_STOCK',
        );
      }

      const result = await restockRepo.subscribe(tx, userId, productId);

      // موعدٌ محدَّد سلفاً: الزبون الذي اشترك الآن يستحق معرفته فوراً، لا
      // انتظار دورة جدولة تخبره بما هو مكتوب في القاعدة أصلاً.
      //
      // [CRITICAL] مشروط بـ`!alreadySubscribed`. الضغط المتكرّر على الزرّ —
      // أو إعادة إرسال الطلب بعد انقطاع شبكة — يصل الخادمَ طلباتٍ حقيقية،
      // وإشعارٌ لكل واحدة منها إزعاجٌ لا خدمة. الاشتراك الجديد وحده يُشعر.
      if (!result.alreadySubscribed && product.restockAt) {
        await notifyExpected(tx, {
          userIds: [userId],
          productId,
          productName: product.name,
          restockAt: product.restockAt,
          updated: false,
        });
      }

      return {
        subscribed: true,
        alreadySubscribed: result.alreadySubscribed,
        restockAt: product.restockAt,
      };
    });
  },

  async unsubscribe(userId: string, productId: string) {
    const removed = await restockRepo.unsubscribe(db, userId, productId);
    return { subscribed: false, wasSubscribed: removed };
  },

  async mine(userId: string) {
    return restockRepo.listMine(db, userId);
  },

  /** طلبات إعادة التوفر من وجهة الإدارة. */
  async adminDemand() {
    return restockRepo.adminDemand(db);
  },

  /**
   * إعلام المشتركين بموعد التوفر المتوقَّع بعد ضبطه أو تعديله.
   *
   * تُستدعى من مسار تعديل المنتج داخل معاملته، بعد أن يثبت أن الموعد
   * **تغيّر فعلاً** — لا مع كل حفظ. القرار هناك لأنه يحتاج القيمة السابقة.
   *
   * تعيد عدد الإشعارات المكتوبة. صفرٌ يعني «لا مشترك ينتظر» لا فشلاً:
   * ضبط موعدٍ لمنتج لا ينتظره أحد عملية مشروعة بلا أثر.
   *
   * [CRITICAL] لا تُفرّغ الاشتراكات. إشعار الموعد المتوقَّع ليس إشعار
   * التوفر: الزبون ما زال ينتظر، واشتراكه يجب أن يبقى ليصله `backInStock`
   * حين يعود المنتج فعلاً — وليصله تعديلُ الموعد إن تغيّر ثانيةً.
   */
  async notifyExpectedRestock(
    tx: pg.PoolClient,
    input: {
      productId: string;
      productName: string;
      restockAt: string;
      /** هل هذا تعديل لموعد أُعلن سابقاً؟ يغيّر النصّ لا التصنيف. */
      updated: boolean;
    },
  ): Promise<number> {
    const userIds = await restockRepo.subscriberIds(tx, input.productId);
    if (userIds.length === 0) return 0;
    return notifyExpected(tx, { ...input, userIds });
  },

  /**
   * عودة المخزون من صفر إلى ما فوق: إنشاء إشعارات `backInStock` لكل
   * المشتركين وفراغ الاشتراكات — داخل معاملة المنتج نفسها.
   *
   * [TRUTH] هذا يُنشئ **سجلات إشعار داخل التطبيق** فقط؛ لا push ولا أجهزة.
   * الرقم المعاد هو عدد السجلات المكتوبة، ويُحذف الاشتراك بعدها فوراً حتى
   * لا يتكرر الإشعار للطلب نفسه في كل تحديث لاحق.
   */
  async notifyRestocked(
    tx: pg.PoolClient,
    productId: string,
    productName: string,
  ): Promise<number> {
    const userIds = await restockRepo.subscriberIds(tx, productId);
    if (userIds.length === 0) return 0;

    // مشتركو المنتج قد يختلفون لغةً — إرسالٌ لكل لغة على حدة.
    const byLocale = await userRepo.groupIdsByLocale(tx, userIds);
    let created = 0;
    for (const [locale, ids] of byLocale) {
      created += await notificationRepo.createMany(tx, {
        userIds: ids,
        type: 'backInStock',
        ...PARAM_TEMPLATES.backInStock[locale](productName),
        productId,
      });
    }
    // الإشعار الواحد يستهلِك الاشتراك: لا تنبيه مكرّر للطلب نفسه.
    await restockRepo.clearForProduct(tx, productId);
    return created;
  },

  /**
   * المخزون عاد من صفر إلى ما فوق — **أيّاً كان المسار** (§42.5).
   *
   * [CRITICAL] العقد معرَّفٌ على انتقال المخزون لا على شاشةٍ بعينها. مساران
   * يُعيدانه: حفظُ المسؤول، ورفضُ طلبٍ مقبول يُرجع ما استُهلك
   * (`releaseStockOnRejection`). كان الثاني يُرجع القطعة بصمت: المشترك لا
   * يُبلَّغ، واشتراكه يبقى على منتجٍ متوفر فيختفي من «طلبات التوفر» في
   * اللوحة، والموعد المتوقَّع يبقى — ثم يعود «متوقَّع توفره يوم كذا» لحظةَ
   * تُباع القطعة ثانيةً. تعريفٌ واحد يُستدعى من المسارين داخل معاملة كلٍّ منهما.
   */
  async stockReturned(tx: pg.PoolClient, productId: string, productName: string): Promise<number> {
    const created = await this.notifyRestocked(tx, productId, productName);
    // الموعد المتوقَّع تحقّق، فلا معنى لبقائه.
    await tx.query('UPDATE products SET restock_at = NULL WHERE id = $1', [productId]);
    return created;
  },
};

/**
 * صياغة موعد التوفر بالعربية — «١٥ سبتمبر».
 *
 * التاريخ يُعرض بمنطقة المتجر الزمنية لا بـUTC: موعدٌ ضُبط في العاشرة مساءً
 * ببغداد يقع في اليوم التالي بتوقيت UTC، فيقرأ الزبون يوماً غير الذي قصده
 * المسؤول.
 */
const ARABIC_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
] as const;

export function formatExpectedRestockDate(iso: string, locale: AppLocale = 'ar'): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: config.storeTimezone,
    day: 'numeric',
    month: 'numeric',
  }).formatToParts(new Date(iso));
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const monthIndex = Number(parts.find((p) => p.type === 'month')?.value ?? '1') - 1;
  // اليوم والشهر رقمياً من `en-US` — أرقام غربية دائماً. الاسم وحده يُترجَم.
  return `${day} ${MONTH_NAMES[locale][monthIndex] ?? ''}`.trim();
}

/**
 * كتابة إشعارات الموعد المتوقَّع.
 *
 * نصّان لا نوعان: «متوقَّع» و«تعديل الموعد» حدثان يفهمهما الزبون من الجملة،
 * ويفتحان المنتج نفسه عند الضغط — فلا داعي لتصنيفين في القاعدة.
 */
async function notifyExpected(
  tx: pg.PoolClient,
  input: {
    userIds: string[];
    productId: string;
    productName: string;
    restockAt: string;
    updated: boolean;
  },
): Promise<number> {
  const byLocale = await userRepo.groupIdsByLocale(tx, input.userIds);
  let created = 0;
  for (const [locale, ids] of byLocale) {
    const when = formatExpectedRestockDate(input.restockAt, locale);
    created += await notificationRepo.createMany(tx, {
      userIds: ids,
      type: 'restockScheduled',
      ...PARAM_TEMPLATES[input.updated ? 'restockRescheduled' : 'restockScheduled'][
        locale
      ](input.productName, when),
      productId: input.productId,
    });
  }
  return created;
}
