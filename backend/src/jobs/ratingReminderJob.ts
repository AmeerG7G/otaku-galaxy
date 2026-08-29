import type pg from 'pg';
import { config } from '../config/index.js';
import { db } from '../database/pool.js';

/**
 * تذكير التقييم بعد الاستلام.
 *
 * لماذا جدولة على الخادم لا مؤقّت في التطبيق: المطلوب أن يصل التذكير بعد
 * يوم من الاستلام حتى لو أغلق العميل التطبيق، أو أعاد تشغيل هاتفه، أو بقي
 * بلا إنترنت، أو لم يفتح التطبيق إلا بعد أسبوع. `setTimeout` في الواجهة
 * يموت مع العملية؛ العمود `rating_available_at` في قاعدة البيانات لا يموت.
 *
 * الاستحقاق مشتقّ من حالة قاعدة البيانات لا من ذاكرة العملية، فإعادة تشغيل
 * الخادم لا تُضيّع أي تذكير ولا تُكرّره: `rating_reminder_sent_at` هو
 * الحارس، ويُكتب في نفس الجملة التي تُنشئ الإشعار.
 */

const REMINDER_TITLE = 'شلونها المنتجات؟ ⭐';
const REMINDER_BODY =
  'مرّ يوم على استلامك الطلب — شاركنا رأيك واكسب نقاط المجرّة.';

/**
 * يُرسل التذكيرات المستحقة ويعيد عددها.
 *
 * الجملة واحدة ومتذرّية: `UPDATE ... RETURNING` يقفل الصفوف ويعلّمها
 * مُرسَلة، والإدراج يقرأ من نتيجته. `FOR UPDATE SKIP LOCKED` يجعل تشغيل
 * أكثر من نسخة من الخادم آمناً — كل نسخة تأخذ دفعة مختلفة بلا تكرار.
 */
export async function dispatchDueRatingReminders(
  client: pg.Pool | pg.PoolClient = db,
  batchSize = config.orders.ratingReminderBatchSize,
): Promise<number> {
  const { rows } = await client.query<{ id: string }>(
    `WITH due AS (
       UPDATE orders
          SET rating_reminder_sent_at = now()
        WHERE id IN (
          SELECT id FROM orders
           WHERE status = 'COMPLETED'
             AND rating_reminder_sent_at IS NULL
             AND rating_available_at IS NOT NULL
             AND rating_available_at <= now()
           ORDER BY rating_available_at
           LIMIT $1
           FOR UPDATE SKIP LOCKED
        )
        RETURNING id, user_id
     )
     INSERT INTO notifications (user_id, type, title, body, order_id)
     SELECT due.user_id, 'receiptReminder', $2, $3, due.id
       FROM due
     RETURNING id`,
    [Math.max(1, Math.trunc(batchSize)), REMINDER_TITLE, REMINDER_BODY],
  );
  return rows.length;
}

/**
 * إرسال تذكير طلب واحد فوراً (زرّ «إرسال الإشعار الآن» في لوحة الإدارة).
 *
 * يستخدم نفس حارس `rating_reminder_sent_at` وفي نفس الجملة المتذرّية، فلا
 * فرق بين الإرسال اليدوي والمجدول من ناحية منع التكرار: أول من يعلّم الصف
 * يفوز. ضغطتان متتاليتان تُنتجان إشعاراً واحداً، والجدولة لن تعيد إرساله.
 *
 * يعيد `false` إذا كان الطلب غير مستلَم أو كان التذكير مُرسَلاً أصلاً.
 */
export async function sendRatingReminderNow(
  orderId: string,
  client: pg.Pool | pg.PoolClient = db,
): Promise<boolean> {
  const { rows } = await client.query<{ id: string }>(
    `WITH due AS (
       UPDATE orders
          SET rating_reminder_sent_at = now()
        WHERE id = $1
          AND status = 'COMPLETED'
          AND delivered_at IS NOT NULL
          AND rating_reminder_sent_at IS NULL
        RETURNING id, user_id
     )
     INSERT INTO notifications (user_id, type, title, body, order_id)
     SELECT due.user_id, 'receiptReminder', $2, $3, due.id
       FROM due
     RETURNING id`,
    [orderId, REMINDER_TITLE, REMINDER_BODY],
  );
  return rows.length > 0;
}

/**
 * يشغّل الفحص الدوري ويعيد دالة إيقاف.
 *
 * يُستدعى من `server.ts` وحده — لا من `createApp()` — حتى لا تشغّل
 * الاختباراتُ التي تبني التطبيق مؤقّتاً في الخلفية.
 */
export function startRatingReminderScheduler(
  intervalMs = config.orders.ratingReminderIntervalMs,
): () => void {
  let running = false;

  const tick = async () => {
    // منع تداخل دورتين إذا طالت واحدة أكثر من الفاصل الزمني.
    if (running) return;
    running = true;
    try {
      const sent = await dispatchDueRatingReminders();
      if (sent > 0) {
        console.log(`[rating-reminder] أُرسل ${sent} تذكير تقييم`);
      }
    } catch (error) {
      // فشل دورة واحدة لا يُسقط الخادم؛ الدورة التالية تلتقط نفس الصفوف
      // لأنها لم تُعلَّم مُرسَلة.
      console.error('[rating-reminder] فشلت دورة التذكير:', error);
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  // لا يمنع الخروج عند الإغلاق.
  timer.unref();

  return () => clearInterval(timer);
}
