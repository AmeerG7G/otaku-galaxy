import type pg from 'pg';
import { sendRatingReminderNow } from '../jobs/ratingReminderJob.js';
import { db, withTransaction } from '../database/pool.js';
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
  ORDER_STATUS_TRANSITIONS,
  type OrderStatus,
} from '../types/index.js';
import { Errors } from '../utils/errors.js';
import { businessConfigService } from './businessConfigService.js';

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
 * مهلة فتح التقييم المعمول بها الآن.
 *
 * تُقرأ عند كل انتقال حالة لا مرة واحدة عند الإقلاع، فتغييرُها من لوحة
 * التحكم يسري على الطلب التالي مباشرةً. الطلبات القائمة لا تتأثر لأن
 * الموعد مثبَّت في `rating_available_at` وقت الخروج للتوصيل.
 */
async function ratingDelayHours(): Promise<number> {
  return businessConfigService.value('order_rating_delay_hours');
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

      // سقف الخصم رسوم التوصيل نفسها — لا توصيل سالب مهما تراكم الترويج.
      const deliveryDiscount = Math.min(deliveryPromoTotal, deliveryFee);

      // خصم عيد الميلاد: يُحتسب على الخادم فقط، ويُستهلك مرة واحدة سنوياً.
      // النسبة تُقرأ لحظة إنشاء الطلب، فتغييرها لاحقاً لا يمسّ طلباً مضى.
      const birthday = await birthdayRepo.status(tx, userId);
      const birthdayPercent = await businessConfigService.value('birthday_discount_percent');
      const productsTotal = snapshots.reduce((sum, item) => sum + item.lineTotal, 0);
      const discount = birthday.rewardAvailable
        ? Math.round((productsTotal * birthdayPercent) / 100)
        : 0;

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
        deliveryDiscount,
      });

      if (discount > 0) {
        // القيد الفريد هو الحارس الحقيقي: إن فشل الإدراج فالخصم مستهلك
        // بالفعل هذه السنة، فنتراجع عن الطلب كاملاً بدل منحه مرتين.
        const consumed = await birthdayRepo.consume(tx, userId, order.id, discount);
        if (!consumed) {
          throw Errors.conflict('خصم عيد الميلاد مستخدم هذه السنة', 'BIRTHDAY_DISCOUNT_USED');
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
    if (order.status !== 'PENDING_ADMIN_CONFIRMATION' && order.status !== 'CONFIRMED') {
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

    // نافذة التقييم تُثبَّت ساعةَ يخرج الطلب للتوصيل — وهو فعل الإدارة.
    // تأكيد العميل لاحقاً لا يحرّكها، فلا يبدأ المؤقّت من ضغطته.
    // المهلة تُقرأ الآن من إعدادات الأعمال وتُثبَّت في `rating_available_at`.
    // الطلبات التي خرجت للتوصيل سابقاً تحتفظ بموعدها المحفوظ: `markDispatched`
    // مشروط بـ`dispatched_at IS NULL`، فتغيير الإعداد لا يعيد تشغيل عدّاد أحد.
    if (status === 'OUT_FOR_DELIVERY') {
      await orderRepo.markDispatched(tx, order.id, await ratingDelayHours());
    }

    if (!customerId) return;

    // منح نقاط الاستلام مرة واحدة — الفهرس الفريد يمنع التكرار.
    if (status === 'COMPLETED' && order.status !== 'COMPLETED') {
      // تثبيت لحظة الاستلام وفتح نافذة التقييم بعدها. داخل المعاملة نفسها،
      // فإمّا أن يُسجَّل الاستلام بنافذته كاملاً أو لا يُسجَّل شيء.
      await orderRepo.markDelivered(tx, order.id, await ratingDelayHours());
      // المبلغ يُقرأ لحظة المنح ويُكتب في الدفتر. تغيير الإعداد لاحقاً لا
      // يمسّ هذا الصفّ ولا أي صفّ سابق — الرصيد مجموع ما كُتب فعلاً.
      await pointsRepo.award(tx, {
        userId: customerId,
        label: 'استلام طلب',
        amount: await businessConfigService.value('points_order_received'),
        reason: 'order_received',
        orderId: order.id,
      });
    }

    const notification = buildStatusNotification(status, note);
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
 * نص الإشعار لكل انتقال حالة. الحالات الداخلية (التجهيز) لا تُشعر العميل —
 * التطبيق يعرضها ضمن «قيد التوصيل» أصلاً.
 */
function buildStatusNotification(
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
    case 'CONFIRMED':
      return {
        type: 'orderAccepted',
        title: 'تم قبول طلبك 🎉',
        body: note ?? 'طلبك مقبول وقيد التجهيز، وراح يوصلك قريباً.',
      };
    case 'OUT_FOR_DELIVERY':
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
