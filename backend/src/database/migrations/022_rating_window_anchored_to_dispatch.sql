-- 022_rating_window_anchored_to_dispatch.sql
-- نافذة التقييم تُثبَّت عند إرسال الطلب للتوصيل، لا عند ضغطة العميل.
--
-- الخلل: `rating_available_at` كان يُحسب في الانتقال إلى COMPLETED، و
-- COMPLETED في مسار العميل هو لحظة ضغطه «نعم، استلمت الطلب». فالنتيجة أن
-- مؤقّت التقييم يبدأ من ضغطة العميل: يخرج الطلب للتوصيل صباحاً، يؤكّد
-- العميل استلامه بعد ساعات، فيُقفل التقييم ٢٤ ساعة إضافية من تلك اللحظة.
--
-- الصحيح أن المرجع هو فعل الإدارة (إخراج الطلب للتوصيل). عندها:
--   • أُرسل للتوصيل ١٠:٠٠ ومهلة ٢٤ ساعة → التقييم يُفتح ١٠:٠٠ من الغد،
--     مهما تأخّر العميل في التأكيد.
--   • مضت النافذة قبل التأكيد → التقييم متاح فور التأكيد.
-- وتأكيد العميل لم يعد يحرّك الموعد إطلاقاً.

ALTER TABLE orders
  -- لحظة خروج الطلب للتوصيل — مرجع نافذة التقييم.
  ADD COLUMN dispatched_at TIMESTAMPTZ;

-- القيدان القديمان يفترضان أن النافذة لا توجد قبل تأكيد الاستلام، وأنها لا
-- تسبقه. كلاهما صار خاطئاً بعد نقل المرجع: النافذة تُضبط عند الإرسال، وقد
-- تكون قد مضت قبل أن يؤكّد العميل.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_rating_window_pair;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_rating_after_delivery;

-- ملء المرجع للطلبات القائمة من سجل الحالات.
UPDATE orders o
   SET dispatched_at = h.at
  FROM (
    SELECT order_id, MAX(created_at) AS at
      FROM order_status_history
     WHERE status = 'OUT_FOR_DELIVERY'
     GROUP BY order_id
  ) h
 WHERE o.id = h.order_id AND o.dispatched_at IS NULL;

-- الطلبات المستلَمة التي لم يُرسَل تذكيرها بعد تُعاد جدولتها على المرجع
-- الصحيح، فيستفيد العملاء الحاليون من التصحيح بدل أن يبقوا على مؤقّت بدأ
-- من ضغطتهم. ما أُرسل تذكيره فعلاً لا يُمَس — الإشعار وصل.
UPDATE orders
   SET rating_available_at = GREATEST(
         dispatched_at + (rating_available_at - delivered_at),
         dispatched_at
       )
 WHERE status = 'COMPLETED'
   AND dispatched_at IS NOT NULL
   AND delivered_at IS NOT NULL
   AND rating_available_at IS NOT NULL
   AND rating_reminder_sent_at IS NULL;

-- بيانات قديمة قد تسبق فيها النافذةُ الإرسالَ: صفوف رُدمت في الهجرة ٠٢٠
-- بـ`updated_at` كبديل عن لحظة الاستلام، أو أُعيدت جدولتها يدوياً قبل
-- الإرسال. تُقصَّ إلى لحظة الإرسال حتى يصحّ القيد على كل الصفوف.
UPDATE orders
   SET rating_available_at = dispatched_at
 WHERE dispatched_at IS NOT NULL
   AND rating_available_at IS NOT NULL
   AND rating_available_at < dispatched_at;

-- القيد يُضاف بعد أن تستقيم البيانات، لا قبلها.
ALTER TABLE orders
  ADD CONSTRAINT orders_rating_after_dispatch
    CHECK (
      rating_available_at IS NULL
      OR dispatched_at IS NULL
      OR rating_available_at >= dispatched_at
    );
