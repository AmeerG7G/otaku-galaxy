-- 043_review_opens_on_receipt.sql
-- التقييم يُفتح بتأكيد الاستلام، لا بمهلة يضبطها المسؤول.
--
-- ما كان: `rating_available_at` يُحسب عند خروج الطلب للتوصيل بإضافة مهلة
-- (`order_rating_delay_hours`) يضبطها المسؤول من اللوحة، والتقييم لا يُفتح
-- قبل بلوغها. فالزبون الذي استلم طلبه وضغط «استلمت طلبي» كان يُقال له
-- «التقييم يُفتح بعد ١٦ ساعة» — يُسأل عن رأيه في شيء بيده بعد أن ينساه.
--
-- ما صار: أهلية التقييم مشتقّة من الاستلام نفسه (`delivered_at`). لا مهلة،
-- ولا إعداد، ولا عمود يُقارَن بالساعة.
--
-- ═══ لماذا لا يُحذف العمود ═══
--
-- [CRITICAL] `rating_available_at` كان يخدم وظيفتين لا واحدة:
--   ١) بوّابة أهلية التقييم — تُلغى هنا.
--   ٢) موعد إرسال تذكير «شلونها المنتجات؟» — ميزة إشعارات قائمة ومستقلة،
--      تقرأها `dispatchDueRatingReminders` و`rescheduleReminder` وزرّ
--      «إرسال التذكير الآن» في اللوحة.
--
-- حذفُ العمود كان سيُسقط التذكيرات معه. وإبقاؤه باسمه القديم كان سيترك في
-- المخطّط عموداً اسمه «التقييم متاح في» لا علاقة له بمتى يُتاح التقييم —
-- اسمٌ يكذب، وأول من يقرأه لاحقاً سيربط الأهلية به من جديد. فيُعاد تسميته
-- إلى وظيفته الباقية وحدها.
ALTER TABLE orders RENAME COLUMN rating_available_at TO rating_reminder_at;

-- القيدان يحملان الاسم القديم في نصّهما؛ يُعاد بناؤهما على الاسم الجديد
-- بنفس الدلالة تماماً (لا تذكير قبل الإرسال، ولا إرسالَ تذكيرٍ بلا موعد).
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_rating_after_dispatch;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_rating_reminder_needs_window;

ALTER TABLE orders
  ADD CONSTRAINT orders_reminder_after_dispatch
    CHECK (
      rating_reminder_at IS NULL
      OR dispatched_at IS NULL
      OR rating_reminder_at >= dispatched_at
    ),
  ADD CONSTRAINT orders_reminder_sent_needs_schedule
    CHECK (rating_reminder_sent_at IS NULL OR rating_reminder_at IS NOT NULL);

-- ═══ إزالة الإعدادات التي لم تعد تُقرأ ═══
--
-- `order_rating_delay_hours` لم يعد له قارئ إطلاقاً بعد هذه الهجرة.
-- `birthday_discount_percent` صار قاعدة ثابتة في `src/domain/birthday.ts`.
--
-- تُحذف الصفوف بدل تركها: رقمٌ باقٍ في القاعدة يبدو أنه يؤثّر وهو لا يؤثّر
-- أسوأ من غيابه — يُقرأ يوماً على أنه الحقيقة.
DELETE FROM store_settings
 WHERE key IN ('order_rating_delay_hours', 'birthday_discount_percent');
