import { config } from '../config/index.js';
import { db } from '../database/pool.js';
import { audienceRepo, type Audience } from '../repositories/audienceRepo.js';
import { notificationRepo } from '../repositories/notificationsRepo.js';
import { userRepo } from '../repositories/userRepo.js';
import { Errors } from '../utils/errors.js';
import { pushService } from './pushService.js';
import { pushProvider } from './push/index.js';

/**
 * نتيجة بثّ إشعار.
 *
 * [CRITICAL] `recipients` هو عدد **السجلات المكتوبة داخل التطبيق**، وليس
 * عدد الأجهزة التي وصلها إشعار دفع. لا مزوّد دفع مربوطاً بالمنظومة بعد،
 * فـ`push` يبقى `null` — لا صفراً ولا «نجح». الفرق ليس تجميلاً: مسؤولٌ
 * يقرأ «أُرسل إلى ٤٠٠» ويظنّ أن أربعمئة هاتف رنّ، بينما الحقيقة أن أربعمئة
 * سجل ستُقرأ متى فتح أصحابها التطبيق.
 */
export interface BroadcastResult {
  /** عدد سجلات الإشعار المنشأة داخل التطبيق. */
  recipients: number;
  /** حالة الدفع الخارجي — `null` ما دام لا مزوّد مربوطاً. */
  push: null | { provider: string; delivered: number; failed: number };
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

    // السجلّ أولاً ثم الدفع: الزبون سيرى الإشعار في التطبيق حتى لو تعذّر
    // إيصاله إلى نظام الهاتف. الدفع لا يرمي (انظر `pushService`).
    await pushService.pushToUsers({
      userIds: [input.userId],
      title: input.title,
      body: input.body,
    });

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

    // الحقل `push` كان محجوزاً منذ البداية بقيمة `null`؛ صار يحمل نتيجة
    // فعلية بالشكل نفسه الذي أعلنه العقد — بلا تغيير في العقد.
    // `failed` = الرموز التي رفضها المزوّد وعُطِّلت، لا أخطاء الشبكة العابرة.
    const result = await pushService.pushToUsers({
      userIds,
      title,
      body: input.body,
    });

    return {
      recipients,
      push: {
        provider: pushProvider().name,
        delivered: result.sent,
        failed: result.invalidTokens.length,
      },
    };
  },
};
