import type pg from 'pg';
import { userRepo } from '../repositories/userRepo.js';
import { renderNotification } from '../domain/notificationTemplates.js';
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from '../utils/locale.js';
import { config } from '../config/index.js';
import { sendRatingReminderNow } from '../jobs/ratingReminderJob.js';
import { db, withTransaction } from '../database/pool.js';
import { birthdayDiscountAmount } from '../domain/birthday.js';
import {
  eligiblePurchaseValue,
  purchasePointsFor,
} from '../domain/galaxyPoints.js';
import { birthdayRepo } from '../repositories/birthdayRepo.js';
import { cartRepo } from '../repositories/cartRepo.js';
import { productRepo } from '../repositories/catalogRepo.js';
import { governorateRepo } from '../repositories/storefrontRepo.js';
import { notificationRepo } from '../repositories/notificationsRepo.js';
import { orderRepo, type OrderItemSnapshot, type OrderWithItems } from '../repositories/orderRepo.js';
import { pointsRepo } from '../repositories/pointsRepo.js';
import { zoneRepo } from '../repositories/zonesRepo.js';
import { ORDER_STATUSES as ALL_ORDER_STATUSES } from '../types/order-status.js';
import { ORDER_STATUS_TRANSITIONS, type OrderStatus } from '../types/index.js';
import { Errors } from '../utils/errors.js';
import { loyaltyRewardsService } from './loyaltyRewardsService.js';
import { restockService } from './restockService.js';

/**
 * استهلاك مخزون طلبٍ لحظةَ **قبوله** — داخل معاملة القبول وبعد قفل صفّ الطلب.
 *
 * ═══ العقد (قرار عمل 2026-09-14) ═══
 *   إرسال الزبون      ← لا تنزيل ولا حجز.
 *   رفضُ طلبٍ منتظر   ← لا مساس بالمخزون (لا يوجد ما يُسترد).
 *   قبول الإدارة      ← هنا وحده: قفلٌ، قراءةُ المخزون **الحالي**، تنزيلٌ
 *                        كامل أو لا شيء.
 *   رفضٌ بعد القبول   ← يُرجع ما استُهلك (`releaseStockOnRejection`) —
 *                        القاعدة القائمة قبل نقل التنزيل، ولم تتغيّر.
 *
 * [CRITICAL] القفل بترتيبٍ ثابت (`ORDER BY id FOR UPDATE`) يمنع الجمود بين
 * قبولَين يحملان المنتجين نفسيهما بترتيبين متعاكسين، ويُسلسل القبولَين
 * المتنافسَين على المنتج نفسه: الثاني ينتظر التزام الأول ثم يقرأ المخزون
 * المحدَّث — فيفشل بـ`INSUFFICIENT_STOCK` بدل أن يبيع ما بيع. يصحّ ذلك عبر
 * عمليات خادم مستقلّة لأن الحارس في PostgreSQL لا في الذاكرة
 * (`scripts/oversell-multi-instance.ts`).
 *
 * [CRITICAL] الكمية تُجمع على **المنتج** لا على السطر: سطران بخيارين لمنتجٍ
 * مخزونه ٣ يُقاسان معاً. والتنزيل مشروط (`stock >= qty`) رغم القفل —
 * حارسٌ ثانٍ لا يكلّف شيئاً. أي رمي هنا يُسقط المعاملة كلها: لا تنزيل
 * جزئي، ولا يتحرّك الطلب من الانتظار.
 */
async function consumeStockOnApproval(tx: pg.PoolClient, order: OrderWithItems) {
  const wanted = new Map<string, { name: string; quantity: number }>();
  for (const item of order.items) {
    const current = wanted.get(item.productId);
    wanted.set(item.productId, {
      name: item.productName,
      quantity: (current?.quantity ?? 0) + item.quantity,
    });
  }
  const ids = [...wanted.keys()].sort();
  if (ids.length === 0) return;

  const { rows } = await tx.query<{ id: string; name: string; stock: string }>(
    `SELECT id, name, stock FROM products WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [ids],
  );
  const locked = new Map(rows.map((row) => [row.id, row]));

  for (const [productId, line] of wanted) {
    const product = locked.get(productId);
    if (!product) {
      throw Errors.conflict(`«${line.name}» لم يعد موجوداً في الكتالوج`, 'PRODUCT_UNAVAILABLE');
    }
    const available = Number(product.stock);
    if (available < line.quantity) {
      throw Errors.conflict(
        `مخزون «${product.name}» غير كافٍ (المتاح: ${available})`,
        'INSUFFICIENT_STOCK',
      );
    }
  }

  for (const [productId, line] of wanted) {
    const { rowCount } = await tx.query(
      'UPDATE products SET stock = stock - $2 WHERE id = $1 AND stock >= $2',
      [productId, line.quantity],
    );
    if ((rowCount ?? 0) === 0) {
      const available = Number(locked.get(productId)?.stock ?? 0);
      throw Errors.conflict(
        `مخزون «${line.name}» غير كافٍ (المتاح: ${available})`,
        'INSUFFICIENT_STOCK',
      );
    }
  }
}

/**
 * إرجاع مخزون طلبٍ **استُهلك** ثم رُفض — داخل معاملة الرفض وبعد قفل صفّ الطلب.
 *
 * يُستدعى فقط لطلبٍ غادر الانتظار (قُبل فنُزِّل مخزونه، أو طلبٍ موروث في
 * `CONFIRMED`/`PREPARING` نُزِّل عند إنشائه تحت النموذج القديم). رفضُ
 * المنتظر لا يمرّ من هنا: لم يُنزَّل شيء فلا شيء يُرجَع. وتكرار الرفض
 * «حالةٌ نفسها» فلا يُرجع ثانيةً — مرةً واحدة بالبناء.
 *
 * الإرجاع بترتيب المعرّفات نفسه الذي يقفل به القبول، فلا يتقاطع رفضٌ
 * وقبولٌ متزامنان على المنتجين نفسيهما بترتيبين متعاكسين. المنتج المحذوف
 * من القاعدة (`product_id` فارغ) لا شيء يُرجَع إليه.
 *
 * [CRITICAL] إرجاعٌ يُعيد منتجاً من صفر هو «عودة التوفر» بعينها: عقد
 * «أعلمني عند توفره» (§42.5) يسري هنا كما يسري على حفظ المسؤول
 * (`restockService.stockReturned`) — في المعاملة نفسها، ومرة واحدة لأن تكرار
 * الرفض «حالةٌ نفسها» لا يمرّ من هنا.
 */
async function releaseStockOnRejection(tx: pg.PoolClient, order: OrderWithItems) {
  const released = new Map<string, number>();
  for (const item of order.items) {
    if (!item.productId) continue;
    released.set(item.productId, (released.get(item.productId) ?? 0) + item.quantity);
  }
  for (const productId of [...released.keys()].sort()) {
    const { rows } = await tx.query<{ name: string; previous: number }>(
      'UPDATE products SET stock = stock + $2 WHERE id = $1 RETURNING name, stock - $2 AS previous',
      [productId, released.get(productId)],
    );
    const product = rows[0];
    if (product && Number(product.previous) === 0) {
      await restockService.stockReturned(tx, productId, product.name);
    }
  }
}

/**
 * مهلة **تذكير** التقييم — لا مهلة فتحه.
 *
 * التقييم يُفتح بتأكيد الاستلام فوراً. هذه القيمة تجدول إشعار «شلونها
 * المنتجات؟» فقط، وهي ثابت تشغيلي في البيئة لا إعداد في لوحة التحكم.
 */
function reviewReminderDelayHours(): number {
  return config.orders.reviewReminderDelayHours;
}


export const orderService = {
  /**
   * إنشاء طلب: معاملة واحدة — بوّابة الطلب، لقطات، إنشاء، تفريغ العربة.
   *
   * [CRITICAL] **لا تنزيل مخزون هنا.** الطلب يدخل الانتظار والمخزون كما
   * هو؛ الاستهلاك يقع عند قبول الإدارة (`consumeStockOnApproval`). ما يبقى
   * هنا «هل يجوز للزبون أن يطلب هذه الكمية الآن؟» — بوّابةُ طلبٍ لا حجزٌ:
   * طلبان منتظران قد يطلبان المخزون نفسه، ويحسم القبولُ بينهما.
   */
  async create(
    userId: string,
    input: {
      governorateId: string;
      fullAddress: string;
      phone: string;
      zoneId?: string | null;
      expectedPrices?: ReadonlyArray<{ productId: string; unitPrice: number }>;
    },
  ) {
    return withTransaction(async (tx) => {
      const governorate = await governorateRepo.listActive(tx);
      const selected = governorate.find((g) => g.id === input.governorateId);
      if (!selected) throw Errors.badRequest('المحافظة غير موجودة أو غير نشطة');

      // رسوم التوصيل: من المنطقة إن كانت المحافظة مقسّمة مناطق، وإلا من
      // المحافظة نفسها. المنطقة إلزامية متى وُجدت مناطق نشطة.
      const zones = await zoneRepo.listForGovernorate(tx, selected.id);
      let deliveryFee = selected.deliveryFee;
      let zoneId: string | null = null;
      let zoneName: string | null = null;

      if (zones.length > 0) {
        if (!input.zoneId) {
          throw Errors.badRequest('اختر منطقة التوصيل', 'ZONE_REQUIRED');
        }
        const zone = zones.find((entry) => entry.id === input.zoneId);
        if (!zone) throw Errors.badRequest('منطقة التوصيل غير صالحة', 'ZONE_INVALID');
        deliveryFee = zone.deliveryFee;
        zoneId = zone.id;
        zoneName = zone.name;
      } else if (input.zoneId) {
        throw Errors.badRequest('هذه المحافظة بلا مناطق توصيل', 'ZONE_NOT_SUPPORTED');
      }

      // [CRITICAL] العربة مقفولة لهذه المعاملة: إرسالٌ متزامن ينتظر ثم يجد
      // عربةً فارغة — لا طلبين من عربة واحدة (انظر `listItemsForCheckout`).
      const cartItems = await cartRepo.listItemsForCheckout(tx, userId);
      if (cartItems.length === 0) throw Errors.badRequest('العربة فارغة — أضف منتجات أولاً', 'EMPTY_CART');

      const snapshots: OrderItemSnapshot[] = [];
      // خصم التوصيل: مجموع مبالغ الترويج عن الكميات المطلوبة. يُحتسب على
      // الخادم من بيانات المنتج وقت الطلب — لا يُقرأ أي مبلغ من العميل.
      let deliveryPromoTotal = 0;
      // قراءةٌ واحدة لكل منتجات العربة لا قراءةٌ لكل سطر.
      const products = await productRepo.findByIds(
        tx,
        [...new Set(cartItems.map((line) => line.productId))],
      );
      for (const item of cartItems) {
        const product = products.get(item.productId);
        // [CRITICAL] شبكة الأمان (CA-14): سطرٌ عُطِّل منتجه بعد آخر مزامنة يرفض
        // الإرسال كله. كان يُسقط من الطلب بصمت فيخرج طلبٌ غير الذي رآه الزبون.
        if (!product || !product.isActive) {
          throw Errors.conflict(
            `«${item.productName}» لم يعد متاحاً — أزله من العربة`,
            'PRODUCT_UNAVAILABLE',
          );
        }
        // [CRITICAL] اتّساق السعر (CA-14، الخيار أ): الزبون رأى في عربته المُزامَنة
        // سعراً غير الحالي ⇒ الإرسال كله يُرفض. المقارنة بالقراءة **نفسها** التي
        // تُبنى منها اللقطة أدناه وداخل هذه المعاملة بعد قفل العربة — لا قراءة
        // سابقة يمكن أن يسبقها تعديلٌ ملتزَم. يقع قبل حجز الخصمين وقبل إنشاء
        // الطلب، فالرفض لا يترك أثراً. السعر المتوقَّع فحصٌ لا مصدر.
        if (
          input.expectedPrices?.some(
            (expected) => expected.productId === product.id && expected.unitPrice !== product.price,
          )
        ) {
          throw Errors.conflict(
            `تغيّر سعر «${product.name}» — راجع سلتك قبل الإرسال`,
            'PRODUCT_PRICE_CHANGED',
          );
        }
        // [CRITICAL] المقارنة بمجموع الطلب من هذا المنتج لا بكمية السطر.
        // التحقق سطراً سطراً كان يمرّر عربةً فيها ثلاثة أسطر من منتجٍ
        // مخزونه ٣، كلٌّ منها قطعة، فيُباع أربعٌ أو خمس. القيد في القاعدة
        // (هجرة ٠٤٦) يمنع انقسام الأسطر، وهذا يحرس المجموع مهما انقسمت.
        //
        // بوّابةُ طلبٍ لا استهلاك: قراءةٌ بلا قفل تكفي لأن لا شيء يُكتب
        // في المنتج هنا. الحكم النهائي عند القبول بالرمز نفسه
        // (`INSUFFICIENT_STOCK`) بعد قفلٍ وقراءةٍ للمخزون الحالي.
        const maxQty = Number(product.stock);
        const orderedFromProduct = cartItems
          .filter((line) => line.productId === item.productId)
          .reduce((sum, line) => sum + line.quantity, 0);
        if (maxQty < orderedFromProduct) {
          throw Errors.conflict(
            `مخزون «${item.productName}» غير كافٍ (المتاح: ${maxQty})`,
            'INSUFFICIENT_STOCK',
          );
        }
        if (product.hasDeliveryPromo && product.deliveryPromoAmount > 0) {
          deliveryPromoTotal += product.deliveryPromoAmount * item.quantity;
        }
        snapshots.push({
          productId: product.id,
          productName: product.name,
          imageUrl: product.images[0] ?? null,
          optionValue: item.optionValue,
          price: product.price,
          quantity: item.quantity,
          lineTotal: product.price * item.quantity,
        });
      }

      // القسمة (سقفُ الزبون وفائضُ المتجر) تقع في `orderRepo.create` من
      // القيمة الخام وحدها، فلا موضعان يحسبانها وقد يتباعدان.

      // خصم عيد الميلاد: يُحتسب على الخادم فقط، ويُستهلك مرة واحدة سنوياً.
      // النسبة تُقرأ لحظة إنشاء الطلب، فتغييرها لاحقاً لا يمسّ طلباً مضى.
      // خصم عيد الميلاد: نسبة **ثابتة** في `domain/birthday.ts` لا إعداد.
      // الأهلية والاستهلاك مرة واحدة سنوياً كما كانا — تغيّر مصدر النسبة
      // وحده.
      // الأهلية بتقويم المتجر — التقويم نفسه الذي يرى به المسؤول «عيد اليوم».
      const birthday = await birthdayRepo.status(tx, userId, config.storeTimezone);
      const productsTotal = snapshots.reduce((sum, item) => sum + item.lineTotal, 0);
      const birthdayDiscount = birthday.rewardAvailable
        ? birthdayDiscountAmount(productsTotal)
        : 0;

      // خصم مزيّة المستوى: يُحجز بالمطالبة ويُستهلك هنا. القيمة تُحسب على
      // الخادم من مجموع المنتجات ولا تتجاوز سقفها المالي؛ لا مبلغ يُقرأ من
      // العميل. الاستهلاك داخل هذه المعاملة، فسقوط الطلب لاحقاً يُرجع المزيّة.
      // يسبق إنشاء الطلب لأن `discount` جزءٌ من الصفّ المُنشأ؛ الربط بالطلب
      // يقع بعد وجود معرّفه.
      const loyaltyReward = await loyaltyRewardsService.reserveDiscountForOrder(
        tx,
        userId,
        productsTotal,
      );
      const discount = birthdayDiscount + (loyaltyReward?.amount ?? 0);

      const order = await orderRepo.create(tx, {
        userId,
        governorateId: input.governorateId,
        province: selected.name,
        deliveryFee,
        fullAddress: input.fullAddress,
        phone: input.phone,
        items: snapshots,
        zoneId,
        zoneName,
        discount,
        deliveryPromoRaw: deliveryPromoTotal,
        loyaltyDiscount: loyaltyReward?.amount ?? 0,
      });

      if (birthdayDiscount > 0) {
        // القيد الفريد هو الحارس الحقيقي: إن فشل الإدراج فالخصم مستهلك
        // بالفعل هذه السنة، فنتراجع عن الطلب كاملاً بدل منحه مرتين.
        const consumed = await birthdayRepo.consume(
          tx,
          userId,
          order.id,
          birthdayDiscount,
          config.storeTimezone,
        );
        if (!consumed) {
          throw Errors.conflict('خصم عيد الميلاد مستخدم هذه السنة', 'BIRTHDAY_DISCOUNT_USED');
        }
      }

      if (loyaltyReward) {
        // الصفّ مقفول منذ الحجز، فهذا التثبيت لا يخسر سباقاً في الحالة
        // العادية. الشرط يبقى: لو استُهلك رغم ذلك نُسقط الطلب كاملاً بدل
        // إنشائه بخصمٍ لم يُحجز فعلاً.
        const applied = await loyaltyRewardsService.consumeReserved(
          tx,
          loyaltyReward.redemptionId,
          order.id,
        );
        if (!applied) {
          throw Errors.conflict('مزيّة الخصم استُهلكت في طلب آخر', 'REWARD_ALREADY_USED');
        }
      }

      await cartRepo.clear(tx, userId);
      const created = await orderRepo.findById(tx, order.id);
      return created;
    });
  },

  async listMyOrders(userId: string, page: number, limit: number, status?: OrderStatus) {
    const [orders, statusCounts] = await Promise.all([
      orderRepo.listByUser(db, userId, page, limit, status),
      orderRepo.statusCounts(db, userId),
    ]);
    return { ...orders, statusCounts };
  },

  /**
   * الطلب الذي ينتظر تأكيد استلام، إن وُجد.
   *
   * يقرؤه التطبيق عند كل فتح ليقرّر إظهار «هل استلمت طلبك؟». المرجع هو
   * حالة الطلب في القاعدة لا أي علامة محلية، فالإجابة تبقى صحيحة بعد
   * إعادة التثبيت أو الدخول من جهاز آخر، وتختفي فور تأكيد الاستلام.
   */
  async pendingConfirmation(userId: string) {
    return orderRepo.findAwaitingConfirmation(db, userId);
  },

  async getMyOrder(userId: string, orderId: string) {
    const order = await orderRepo.findById(db, orderId);
    if (!order) throw Errors.notFound('الطلب غير موجود');
    if (order.customer?.id !== userId) throw Errors.forbidden();
    return order;
  },

  async adminList(page: number, limit: number, status?: OrderStatus) {
    const [orders, statusCounts] = await Promise.all([
      orderRepo.listAll(db, page, limit, status),
      orderRepo.statusCounts(db),
    ]);
    return { ...orders, statusCounts };
  },

  async adminGet(orderId: string) {
    const order = await orderRepo.findById(db, orderId);
    if (!order) throw Errors.notFound('الطلب غير موجود');
    return order;
  },

  /**
   * تحديث حالة الطلب. إضافةً للتحقق من الانتقال واستهلاك المخزون عند القبول،
   * يتولّى هذا المسار الآثار الجانبية كلها داخل معاملة واحدة:
   * - إشعار العميل بكل انتقال يهمّه.
   * - منح نقاط المجرّة عند الاستلام (مرة واحدة لكل طلب).
   * سبب الرفض إلزامي — لا يُرفض طلب بلا سبب واضح للعميل.
   */
  async adminUpdateStatus(
    adminId: string,
    orderId: string,
    input: { status: OrderStatus; note?: string },
  ) {
    // القراءة تحت القفل داخل `applyStatusTransition` هي التي تحسم الوجود
    // والحالة معاً؛ قراءةٌ قبلها كانت تُنفَّذ ثم تُهمَل.
    return applyStatusTransition(orderId, input.status, input.note, adminId);
  },

  /**
   * إعادة جدولة تذكير الاستلام/التقييم (الإدارة).
   *
   * لا يُنشئ مؤقّتاً في الذاكرة: يُحرّك العمود في القاعدة فقط، والجدولة
   * الدورية تلتقط القيمة الجديدة في دورتها التالية. لذلك لا يمكن أن يبقى
   * تذكير قديم «معلّقاً» بموعده الأول بعد التعديل — لا يوجد مؤقّت قديم أصلاً.
   */
  async rescheduleReminder(
    orderId: string,
    input: { delayHours?: number; remindAt?: Date },
  ) {
    const order = await orderRepo.findById(db, orderId);
    if (!order) throw Errors.notFound('الطلب غير موجود');
    if (!order.dispatchedAt) {
      throw Errors.conflict(
        'لا تذكير قبل خروج الطلب للتوصيل',
        'ORDER_NOT_DISPATCHED',
      );
    }
    if (order.ratingReminderSentAt) {
      throw Errors.conflict('أُرسل التذكير مسبقاً', 'REMINDER_ALREADY_SENT');
    }

    const remindAt =
      input.remindAt ??
      new Date(
        order.dispatchedAt.getTime() + (input.delayHours ?? 24) * 3_600_000,
      );

    const applied = await orderRepo.rescheduleReminder(db, orderId, remindAt);
    if (!applied) {
      throw Errors.conflict('تعذّرت إعادة الجدولة', 'RESCHEDULE_FAILED');
    }
    return orderRepo.findById(db, orderId);
  },

  /** إرسال التذكير فوراً (الإدارة). مُحصَّن ضد التكرار في القاعدة. */
  async sendReminderNow(orderId: string) {
    const order = await orderRepo.findById(db, orderId);
    if (!order) throw Errors.notFound('الطلب غير موجود');
    if (!order.deliveredAt) {
      throw Errors.conflict(
        'لا تذكير قبل تأكيد استلام الطلب',
        'ORDER_NOT_DELIVERED',
      );
    }

    // الحارس كله في الجملة الواحدة؛ الرفض يُقرأ بعدها لتسمية سببه. طلبٌ مستلَم
    // لم يُرسَل تذكيره ورفضته الجملة لم يبقَ فيه ما يُقيَّم (CA-16) — تذكيرٌ
    // «اكسب نقاط المجرّة» عنه وعدٌ لا يتحقق.
    const sent = await sendRatingReminderNow(orderId);
    if (!sent) {
      const current = await orderRepo.findById(db, orderId);
      if (current && !current.ratingReminderSentAt && current.reviewableProductCount === 0) {
        throw Errors.conflict('قيّم العميل كل منتجات الطلب — لا تذكير يُرسل', 'NOTHING_TO_REVIEW');
      }
      throw Errors.conflict('أُرسل التذكير مسبقاً', 'REMINDER_ALREADY_SENT');
    }
    return orderRepo.findById(db, orderId);
  },

  /**
   * تأكيد العميل استلام طلبه: OUT_FOR_DELIVERY → COMPLETED.
   *
   * لا يكرّر منطق الإكمال — يمرّ بنفس مسار [applyStatusTransition] الذي
   * تستخدمه الإدارة، فالنقاط والإشعار وسجل الحالة تبقى في مكان واحد ولا
   * تنطلق مرتين. الحماية هنا هي الملكية والحالة المبدئية فقط.
   */
  async confirmReceipt(userId: string, orderId: string) {
    const order = await orderRepo.findById(db, orderId);
    if (!order) throw Errors.notFound('الطلب غير موجود');

    // الملكية: لا يؤكّد أحد استلام طلب غيره — نُعيد 404 لا 403 حتى لا
    // نكشف وجود طلبات الآخرين.
    if (order.customer?.id !== userId) {
      throw Errors.notFound('الطلب غير موجود');
    }

    if (order.status === 'COMPLETED') {
      throw Errors.conflict('تم تأكيد استلام هذا الطلب مسبقاً', 'ALREADY_CONFIRMED');
    }

    if (order.status !== 'OUT_FOR_DELIVERY') {
      throw Errors.conflict(
        'لا يمكن تأكيد الاستلام قبل خروج الطلب للتوصيل',
        'NOT_OUT_FOR_DELIVERY',
      );
    }

    return applyStatusTransition(order.id, 'COMPLETED', undefined, userId);
  },
};

/**
 * المسار الموحّد لأي انتقال حالة — تستخدمه الإدارة وتأكيد العميل معاً.
 *
 * كل الآثار الجانبية داخل معاملة واحدة: استهلاك المخزون عند القبول وإرجاعه
 * عند رفض ما قُبل، منح نقاط الاستلام مرة واحدة (يحرسها فهرس فريد)، وإشعار
 * العميل. الاحتفاظ
 * بها هنا يمنع ازدواج المنطق بين مدخلَي الإدارة والعميل.
 *
 * [CRITICAL] القرار كله **داخل** المعاملة وبعد قفل صفّ الطلب: الحالة تُقرأ
 * من جديد تحت القفل لا من نسخةٍ قرأها المستدعي قبل لحظة. بلا ذلك يجتاز
 * قبولان متزامنان للطلب نفسه فحصَ الانتقال معاً فيُستهلك المخزون مرتين؛
 * ومع القفل يرى الثاني الحالة الجديدة فيصير «الحالة نفسها» بلا أثر.
 */
async function applyStatusTransition(
  orderId: string,
  status: OrderStatus,
  rawNote: string | undefined,
  changedBy: string,
) {
  const note = rawNote?.trim() || null;
  const isRejection = status === 'REJECTED';
  if (isRejection && !note) {
    throw Errors.badRequest('سبب الرفض مطلوب', 'REJECTION_REASON_REQUIRED');
  }

  await withTransaction(async (tx) => {
    await orderRepo.lockForUpdate(tx, orderId);
    const order = await orderRepo.findById(tx, orderId);
    if (!order) throw Errors.notFound('الطلب غير موجود');

    const allowed = ORDER_STATUS_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(status) && order.status !== status) {
      throw Errors.conflict(`غير مسموح بالانتقال من ${order.status} إلى ${status}`);
    }

    const customerId = order.customer?.id ?? null;

    // القبول = أول خروجٍ من الانتظار إلى غير الرفض. هنا وحده يُستهلك
    // المخزون؛ رفضُ المنتظر لا يمسّه (لم يُحجز شيء)، وإعادة القبول «حالةٌ
    // نفسها» فلا تمرّ من هنا — التنزيل مرة واحدة بالبناء لا بالعدّ.
    const isApproval =
      order.status === 'PENDING_ADMIN_CONFIRMATION' && !isRejection && status !== order.status;
    if (isApproval) {
      await consumeStockOnApproval(tx, order);
    }
    // رفضُ طلبٍ استُهلك مخزونه (غادر الانتظار ولم يُرفض بعد) يُرجعه. الحالة
    // تُقرأ تحت القفل، فرفضان متزامنان يمرّ أحدهما والآخر يرى `REJECTED`.
    const isReleasingRejection =
      isRejection && order.status !== 'PENDING_ADMIN_CONFIRMATION' && order.status !== 'REJECTED';
    if (isReleasingRejection) {
      await releaseStockOnRejection(tx, order);
    }

    await orderRepo.updateStatus(tx, order.id, status, note, changedBy);

    // موعد **تذكير** التقييم يُثبَّت ساعةَ يخرج الطلب للتوصيل — وهو فعل
    // الإدارة. لا علاقة له بفتح التقييم: ذاك يقع بتأكيد الاستلام.
    if (status === 'OUT_FOR_DELIVERY') {
      await orderRepo.markDispatched(tx, order.id, reviewReminderDelayHours());
    }

    if (!customerId) return;

    // منح نقاط الاستلام مرة واحدة — الفهرس الفريد يمنع التكرار.
    if (status === 'COMPLETED' && order.status !== 'COMPLETED') {
      // تثبيت لحظة الاستلام — وهي وحدها ما يفتح التقييم. داخل المعاملة
      // نفسها مع منح النقاط: إمّا أن يُسجَّل الاستلام كاملاً أو لا شيء.
      await orderRepo.markDelivered(tx, order.id, reviewReminderDelayHours());
      // نقاط الشراء: خمس نقاط عن كل ١٠٬٠٠٠ دينار من قيمة الشراء المؤهَّلة
      // (مجموع المنتجات ناقص خصوماتها — بلا رسوم التوصيل). كانت القيمة
      // مبلغاً ثابتاً يضبطه المسؤول، فطلبٌ بعشرة آلاف وطلبٌ بمليون كانا
      // يمنحان الشيء نفسه.
      //
      // الحساب على الخادم من صفّ الطلب المحفوظ، لا من أي رقم يرسله العميل.
      const purchasePoints = purchasePointsFor(
        eligiblePurchaseValue({
          productsTotal: order.productsTotal,
          discount: order.discount,
        }),
      );
      // طلبٌ صغير قد يستحق صفراً؛ الدفتر يرفض الصفر (`amount <> 0`) ولا معنى
      // لسطر «+٠» في سجلّ الزبون أصلاً.
      if (purchasePoints > 0) {
        await pointsRepo.award(tx, {
          userId: customerId,
          label: 'نقاط شراء',
          amount: purchasePoints,
          reason: 'order_received',
          orderId: order.id,
        });
      }
    }

    // لغة **المستلِم** لا لغة المسؤول الذي غيّر الحالة.
    const recipientLocale = await userRepo.localeOf(tx, customerId);
    const notification = buildStatusNotification(order.status, status, note, recipientLocale);
    if (notification && status !== order.status) {
      await notificationRepo.create(tx, {
        userId: customerId,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        orderId: order.id,
      });
    }
  });

  return orderRepo.findById(db, orderId);
}

/**
 * نص الإشعار لكل انتقال حالة.
 *
 * الحالة السابقة جزء من القرار لا زينة: في المسار الجديد يقفز القبول من
 * الانتظار إلى التوصيل في انتقال واحد، فيجب أن يحمل الإشعارُ القبولَ نفسه
 * (لا يُشعَر العميل «خرج للتوصيل» فقط بلا أن يعرف أن طلبه قُبل). الطلبات
 * الموروثة الواقفة في `CONFIRMED` أو`PREPARING` كانت قد استلمت إشعار القبول
 * أصلاً، فلا يُشعَر القادمُ منها قبولاً ثانياً — يحصل على إشعار التوصيل فقط.
 */
function buildStatusNotification(
  from: OrderStatus,
  status: OrderStatus,
  note: string | null,
  locale: AppLocale,
):
  | {
      type: 'orderAccepted' | 'orderRejected' | 'deliveryUpdate' | 'receiptReminder';
      title: string;
      body: string;
    }
  | null {
  switch (status) {
    // المسار الموروث: طلبات توقّفت عند «تم تأكيده» قبل الدمج الأول.
    case 'CONFIRMED':
      return { type: 'orderAccepted', ...renderNotification('orderAccepted', locale, note) };
    // المسار الموروث: طلبات توقّفت عند «قيد التجهيز» قبل الدمج الثاني.
    case 'PREPARING':
      if (from !== 'PENDING_ADMIN_CONFIRMATION') return null;
      return { type: 'orderAccepted', ...renderNotification('orderAccepted', locale, note) };
    case 'OUT_FOR_DELIVERY':
      // القبول الجديد: الانتظار → التوصيل في خطوة واحدة — إشعار القبول.
      if (from === 'PENDING_ADMIN_CONFIRMATION') {
        return {
          type: 'orderAccepted',
          ...renderNotification('orderAcceptedDispatched', locale, note),
        };
      }
      return { type: 'deliveryUpdate', ...renderNotification('deliveryUpdate', locale, note) };
    case 'COMPLETED':
      return { type: 'receiptReminder', ...renderNotification('orderCompleted', locale, note) };
    case 'REJECTED':
      return { type: 'orderRejected', ...renderNotification('orderRejected', locale, note) };
    default:
      return null;
  }
}
