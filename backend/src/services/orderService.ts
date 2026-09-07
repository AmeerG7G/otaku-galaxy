import type pg from 'pg';
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
import {
  CUSTOMER_CANCELLABLE_STATUSES,
  ORDER_STATUS_TRANSITIONS,
  type OrderStatus,
} from '../types/index.js';
import { Errors } from '../utils/errors.js';
import { loyaltyRewardsService } from './loyaltyRewardsService.js';

/**
 * رفض طلب داخل معاملة واحدة: تحديث الحالة + استرجاع المخزون المحجوز.
 * — تُسترد الكميات مرة واحدة (التحديث نفسه يسجَّل في order_status_history).
 * — تُحمى من الاسترجاع المزدوج: إذا كان الطلب مرفوضاً أصلاً لا يُسترد شيء.
 * يعتمد هذا المسارُ الموحّدَ في رفض الإدارة وفي إلغاء العميل.
 */
async function rejectOrderInTransaction(
  tx: pg.PoolClient,
  order: OrderWithItems,
  status: OrderStatus,
  note: string | null,
  changedBy: string,
) {
  await orderRepo.updateStatus(tx, order.id, status, note, changedBy);
  for (const item of order.items) {
    await tx.query('UPDATE products SET stock = stock + $2 WHERE id = $1', [
      item.productId,
      item.quantity,
    ]);
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
  /** إنشاء طلب: معاملة واحدة — تحقق المخزون، لقطات، إنشاء، تنزيل المخزون، تفريغ العربة. */
  async create(
    userId: string,
    input: { governorateId: string; fullAddress: string; phone: string; zoneId?: string | null },
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

      const cartItems = await cartRepo.listItems(tx, userId);
      if (cartItems.length === 0) throw Errors.badRequest('العربة فارغة — أضف منتجات أولاً');

      const snapshots: OrderItemSnapshot[] = [];
      // خصم التوصيل: مجموع مبالغ الترويج عن الكميات المطلوبة. يُحتسب على
      // الخادم من بيانات المنتج وقت الطلب — لا يُقرأ أي مبلغ من العميل.
      let deliveryPromoTotal = 0;
      for (const item of cartItems) {
        const product = await productRepo.findById(tx, item.productId);
        if (!product || !product.isActive) {
          throw Errors.conflict(`«${item.productName}» لم يعد متاحاً — أزله من العربة`);
        }
        const maxQty = Number(product.stock);
        if (maxQty < item.quantity) {
          throw Errors.conflict(
            `مخزون «${item.productName}» غير كافٍ (المتاح: ${maxQty})`,
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
      const birthday = await birthdayRepo.status(tx, userId);
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
        const consumed = await birthdayRepo.consume(tx, userId, order.id, birthdayDiscount);
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

  async cancelOrder(userId: string, orderId: string) {
    const order = await orderRepo.findById(db, orderId);
    if (!order || order.customer?.id !== userId) throw Errors.notFound('الطلب غير موجود');
    if (!(CUSTOMER_CANCELLABLE_STATUSES as readonly OrderStatus[]).includes(order.status)) {
      throw Errors.conflict('لا يمكن إلغاء طلب في هذه المرحلة');
    }
    // تحديث الحالة + استرجاع المخزون في معاملة واحدة (نفس مسار رفض الإدارة).
    await withTransaction((tx) =>
      rejectOrderInTransaction(tx, order, 'REJECTED', 'أُلغي من قبل العميل', userId),
    );
    return orderRepo.findById(db, order.id);
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
   * تحديث حالة الطلب. إضافةً للتحقق من الانتقال واسترجاع المخزون عند الرفض،
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
    const order = await orderRepo.findById(db, orderId);
    if (!order) throw Errors.notFound('الطلب غير موجود');
    return applyStatusTransition(order, input.status, input.note, adminId);
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

    const sent = await sendRatingReminderNow(orderId);
    if (!sent) {
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

    return applyStatusTransition(order, 'COMPLETED', undefined, userId);
  },
};

/**
 * المسار الموحّد لأي انتقال حالة — تستخدمه الإدارة وتأكيد العميل معاً.
 *
 * كل الآثار الجانبية داخل معاملة واحدة: استرجاع المخزون عند الرفض، منح
 * نقاط الاستلام مرة واحدة (يحرسها فهرس فريد)، وإشعار العميل. الاحتفاظ
 * بها هنا يمنع ازدواج المنطق بين مدخلَي الإدارة والعميل.
 */
async function applyStatusTransition(
  order: OrderWithItems,
  status: OrderStatus,
  rawNote: string | undefined,
  changedBy: string,
) {
  const allowed = ORDER_STATUS_TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(status) && order.status !== status) {
    throw Errors.conflict(`غير مسموح بالانتقال من ${order.status} إلى ${status}`);
  }

  const note = rawNote?.trim() || null;
  const isRejection = status === 'REJECTED';
  if (isRejection && !note) {
    throw Errors.badRequest('سبب الرفض مطلوب', 'REJECTION_REASON_REQUIRED');
  }

  const alreadyRejected = order.status === 'REJECTED';
  const customerId = order.customer?.id ?? null;

  await withTransaction(async (tx) => {
    if (isRejection && !alreadyRejected) {
      await rejectOrderInTransaction(tx, order, status, note, changedBy);
    } else {
      await orderRepo.updateStatus(tx, order.id, status, note, changedBy);
    }

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

    const notification = buildStatusNotification(order.status, status, note);
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

  return orderRepo.findById(db, order.id);
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
      return {
        type: 'orderAccepted',
        title: 'تم قبول طلبك 🎉',
        body: note ?? 'طلبك مقبول وقيد التجهيز، وراح يوصلك قريباً.',
      };
    // المسار الموروث: طلبات توقّفت عند «قيد التجهيز» قبل الدمج الثاني.
    case 'PREPARING':
      if (from !== 'PENDING_ADMIN_CONFIRMATION') return null;
      return {
        type: 'orderAccepted',
        title: 'تم قبول طلبك 🎉',
        body: note ?? 'طلبك مقبول وقيد التجهيز، وراح يوصلك قريباً.',
      };
    case 'OUT_FOR_DELIVERY':
      // القبول الجديد: الانتظار → التوصيل في خطوة واحدة — إشعار القبول.
      if (from === 'PENDING_ADMIN_CONFIRMATION') {
        return {
          type: 'orderAccepted',
          title: 'تم قبول طلبك 🎉',
          body: note ?? 'طلبك مقبول وخرج للتوصيل — الدفع عند الاستلام.',
        };
      }
      return {
        type: 'deliveryUpdate',
        title: 'طلبك بالطريق 🚚',
        // ملاحظة الإدارة هنا هي وقت الوصول المتوقع (مثل: سيصل غداً).
        body: note ?? 'طلبك خرج للتوصيل — الدفع عند الاستلام.',
      };
    case 'COMPLETED':
      return {
        type: 'receiptReminder',
        title: 'تم استلام طلبك',
        body: note ?? 'نتمنى المنتجات عجبتك — شاركنا رأيك واكسب نقاط المجرّة.',
      };
    case 'REJECTED':
      return {
        type: 'orderRejected',
        title: 'ما تم قبول طلبك',
        body: note ?? 'تكدر تتواصل ويانا أو تسوي طلب جديد.',
      };
    default:
      return null;
  }
}
