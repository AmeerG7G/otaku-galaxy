import { config } from '../config/index.js';
import { db } from '../database/pool.js';
import { audienceRepo, type Audience } from '../repositories/audienceRepo.js';
import { notificationRepo } from '../repositories/notificationsRepo.js';
import { userRepo } from '../repositories/userRepo.js';
import { Errors } from '../utils/errors.js';
import { pushStatus } from './push/index.js';

/**
 * نتيجة بثّ إشعار.
 *
 * [CRITICAL] `recipients` هو عدد **السجلات المكتوبة داخل التطبيق**، وليس
 * عدد الأجهزة التي رنّت. الدفع لا يحدث داخل الطلب: كل سجلٍّ يضع صفّه في
 * `push_outbox` (زناد الهجرة ٠٧٠) وترسله المهمّة بعد الردّ. `push.queued` هو
 * عدد الصفوف المنتظِرة، و`provider` اسم المزوّد أو `not_configured` — فلا
 * يقرأ المسؤول «أُرسل إلى ٤٠٠» ويظنّ أن أربعمئة هاتف رنّ.
 */
export interface BroadcastResult {
  /** عدد سجلات الإشعار المنشأة داخل التطبيق. */
  recipients: number;
  push: { provider: string; queued: number };
}

/** اسم المزوّد لردود اللوحة — `not_configured` حين لا اعتماد. */
function providerName(): string {
  const status = pushStatus();
  return status.provider?.name ?? 'not_configured';
}

export const notificationsService = {
  async listMine(userId: string) {
    const [items, unread] = await Promise.all([
      notificationRepo.listMine(db, userId),
      notificationRepo.countUnread(db, userId),
    ]);
    return { items, unread };
  },

  async markRead(userId: string, id: string) {
    const updated = await notificationRepo.markRead(db, userId, id);
    // إعادة تعليم إشعار مقروء ليست خطأ، لكن إشعار شخص آخر غير موجود لهذا المستخدم.
    if (!updated) {
      const unread = await notificationRepo.countUnread(db, userId);
      return { id, unread };
    }
    return { id, unread: await notificationRepo.countUnread(db, userId) };
  },

  async markAllRead(userId: string) {
    const count = await notificationRepo.markAllRead(db, userId);
    return { updated: count, unread: 0 };
  },

  /** إنشاء إشعار يدوي من لوحة التحكم (إعلان/عرض). */
  async createForUser(input: {
    userId: string;
    title: string;
    body: string;
  }) {
    if (!input.title.trim()) throw Errors.badRequest('العنوان مطلوب');
    // المستهدَف يُتحقَّق منه قبل الكتابة: معرّفٌ لا يقابله صفّ كان يصطدم
    // بالمفتاح الأجنبي فيخرج ٥٠٠ بدل «غير موجود».
    if (!(await userRepo.findById(db, input.userId))) {
      throw Errors.notFound('الحساب غير موجود');
    }
    const created = await notificationRepo.create(db, {
      userId: input.userId,
      type: 'promotion',
      title: input.title,
      body: input.body,
    });

    // الدفع يخرج بعد الردّ من `push_outbox` (زناد الإدراج أعلاه): فشلُ FCM لا
    // يُفشل الطلب، وبطؤه لا يُبطئه.
    return created;
  },

  /** عدد من سيصلهم الإشعار — يعرضه المسؤول قبل الضغط على «إرسال». */
  async audienceSize(audience: Audience) {
    return audienceRepo.count(db, audience, config.storeTimezone);
  },

  /**
   * بثّ إشعار إلى جمهور مستهدَف (الكل / زبائن محدَّدون / شريحة).
   *
   * الجمهور يُحسم لحظة الإرسال لا قبله: بين فتح الشاشة والضغط قد يسجّل
   * زبونٌ ميلاده أو يُوقَف حسابه، والقائمة الصحيحة هي قائمة اللحظة.
   */
  async broadcast(input: {
    audience: Audience;
    title: string;
    body: string;
  }): Promise<BroadcastResult> {
    const title = input.title.trim();
    if (!title) throw Errors.badRequest('العنوان مطلوب');

    const userIds = await audienceRepo.ids(db, input.audience, config.storeTimezone);
    if (userIds.length === 0) {
      throw Errors.badRequest('لا يوجد زبائن مطابقون لهذا الاستهداف', 'AUDIENCE_EMPTY');
    }

    const recipients = await notificationRepo.createMany(db, {
      userIds,
      type: 'promotion',
      title,
      body: input.body,
    });

    // [CA-7] لا دفع داخل الطلب: البثّ لآلاف الزبائن كان ينتظر FCM جهازاً
    // جهازاً فتنقضي مهلة اللوحة ويعيد المسؤول الإرسال. الآن يعود الردّ فور
    // كتابة السجلات، ويرسل الصندوق الصادر بعدها (هجرة ٠٧٠).
    return {
      recipients,
      push: { provider: providerName(), queued: recipients },
    };
  },
};
