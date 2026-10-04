import { randomUUID } from 'node:crypto';
import { config } from '../config/index.js';
import { db, withTransaction } from '../database/pool.js';
import { adminAuditRepo } from '../repositories/adminAuditRepo.js';
import { audienceRepo, type Audience } from '../repositories/audienceRepo.js';
import { notificationCampaignsRepo } from '../repositories/notificationCampaignsRepo.js';
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
  /** هوية الحملة الدائمة (٠٧٤). */
  campaignId: string;
  /** `true` حين أُعيد طلبٌ بالمفتاح نفسه — لا سجلّ جديد ولا دفع جديد. */
  replayed: boolean;
}

/** وصف الجمهور كما يُحفظ مع الحملة — أعدادٌ وشرائح، لا معرّفات ولا أرقام. */
function describeAudience(audience: Audience) {
  if (audience.type === 'all') {
    return { audienceType: 'all' as const, audienceSegment: null, audienceWindowDays: null, audienceUserCount: null };
  }
  if (audience.type === 'users') {
    return { audienceType: 'users' as const, audienceSegment: null, audienceWindowDays: null, audienceUserCount: audience.userIds.length };
  }
  return {
    audienceType: 'segment' as const,
    audienceSegment: audience.segment,
    audienceWindowDays: audience.windowDays ?? null,
    audienceUserCount: null,
  };
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

  /**
   * إنشاء إشعار يدوي من لوحة التحكم (إعلان/عرض) — حملةٌ «يدوية» لمستلمٍ واحد.
   *
   * `idempotencyKey` اختياري هنا (اللوحة ترسله دائماً): إعادة الطلب بالمفتاح نفسه
   * تعيد السجلّ نفسه بلا إشعارٍ ثانٍ. غيابه (نسخة لوحة أقدم) = مفتاحٌ جديد.
   */
  async createForUser(input: {
    userId: string;
    title: string;
    body: string;
    createdBy: string;
    idempotencyKey?: string;
  }) {
    if (!input.title.trim()) throw Errors.badRequest('العنوان مطلوب');
    // المستهدَف يُتحقَّق منه قبل الكتابة: معرّفٌ لا يقابله صفّ كان يصطدم
    // بالمفتاح الأجنبي فيخرج ٥٠٠ بدل «غير موجود».
    if (!(await userRepo.findById(db, input.userId))) {
      throw Errors.notFound('الحساب غير موجود');
    }
    const idempotencyKey = input.idempotencyKey ?? randomUUID();
    return withTransaction(async (tx) => {
      const campaignId = await notificationCampaignsRepo.insert(tx, {
        kind: 'manual',
        title: input.title,
        body: input.body,
        audienceType: 'users',
        audienceSegment: null,
        audienceWindowDays: null,
        audienceUserCount: 1,
        recipients: 1,
        createdBy: input.createdBy,
        idempotencyKey,
      });
      if (!campaignId) {
        const existing = await notificationCampaignsRepo.findByKey(tx, idempotencyKey);
        const first = existing ? await notificationRepo.findFirstByCampaign(tx, existing.id) : null;
        if (!existing || existing.kind !== 'manual' || !first) {
          throw Errors.conflict('مفتاح عدم التكرار مستخدم لطلبٍ آخر', 'IDEMPOTENCY_KEY_REUSED');
        }
        return { ...first, campaignId: existing.id, replayed: true };
      }
      const created = await notificationRepo.create(tx, {
        userId: input.userId,
        type: 'promotion',
        title: input.title,
        body: input.body,
        campaignId,
      });
      await adminAuditRepo.record(tx, {
        actorId: input.createdBy,
        action: 'notification.manual_sent',
        targetType: 'notification_campaign',
        targetId: campaignId,
        details: { title: input.title, recipients: 1 },
      });
      // الدفع يخرج بعد الردّ من `push_outbox` (زناد الإدراج أعلاه): فشلُ FCM لا
      // يُفشل الطلب، وبطؤه لا يُبطئه.
      return { ...created, campaignId, replayed: false };
    });
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
    createdBy: string;
    idempotencyKey: string;
  }): Promise<BroadcastResult> {
    const title = input.title.trim();
    if (!title) throw Errors.badRequest('العنوان مطلوب');

    return withTransaction(async (tx) => {
      // [CA-7] إعادةٌ بالمفتاح نفسه (انقطع الردّ، ضغطتان) تعيد الحملة نفسها.
      const existing = await notificationCampaignsRepo.findByKey(tx, input.idempotencyKey);
      if (existing) return replay(existing);

      const userIds = await audienceRepo.ids(tx, input.audience, config.storeTimezone);
      if (userIds.length === 0) {
        throw Errors.badRequest('لا يوجد زبائن مطابقون لهذا الاستهداف', 'AUDIENCE_EMPTY');
      }
      const campaignId = await notificationCampaignsRepo.insert(tx, {
        kind: 'broadcast',
        title,
        body: input.body,
        ...describeAudience(input.audience),
        recipients: userIds.length,
        createdBy: input.createdBy,
        idempotencyKey: input.idempotencyKey,
      });
      if (!campaignId) {
        // طلبٌ متزامن بالمفتاح نفسه التُزم أولاً.
        const committed = await notificationCampaignsRepo.findByKey(tx, input.idempotencyKey);
        if (committed) return replay(committed);
        throw Errors.conflict('مفتاح عدم التكرار مستخدم لطلبٍ آخر', 'IDEMPOTENCY_KEY_REUSED');
      }

      const recipients = await notificationRepo.createMany(tx, {
        userIds,
        type: 'promotion',
        title,
        body: input.body,
        campaignId,
      });
      await adminAuditRepo.record(tx, {
        actorId: input.createdBy,
        action: 'notification.broadcast',
        targetType: 'notification_campaign',
        targetId: campaignId,
        details: { title, recipients, ...describeAudience(input.audience) },
      });

      // [CA-7] لا دفع داخل الطلب: البثّ لآلاف الزبائن كان ينتظر FCM جهازاً
      // جهازاً فتنقضي مهلة اللوحة ويعيد المسؤول الإرسال. الآن يعود الردّ فور
      // كتابة السجلات، ويرسل الصندوق الصادر بعدها (هجرة ٠٧٠).
      return {
        recipients,
        push: { provider: providerName(), queued: recipients },
        campaignId,
        replayed: false,
      };
    });
  },

  async listCampaigns(options: { page: number; limit: number; kind?: 'broadcast' | 'manual' }) {
    return notificationCampaignsRepo.list(db, options);
  },

  async campaignDetail(id: string) {
    const campaign = await notificationCampaignsRepo.detail(db, id);
    if (!campaign) throw Errors.notFound('الحملة غير موجودة');
    return campaign;
  },
};

function replay(existing: { id: string; kind: string; recipients: number }): BroadcastResult {
  if (existing.kind !== 'broadcast') {
    throw Errors.conflict('مفتاح عدم التكرار مستخدم لطلبٍ آخر', 'IDEMPOTENCY_KEY_REUSED');
  }
  return {
    recipients: existing.recipients,
    push: { provider: providerName(), queued: 0 },
    campaignId: existing.id,
    replayed: true,
  };
}
