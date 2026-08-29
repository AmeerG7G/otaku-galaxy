-- 020_delivery_and_rating_window.sql
-- نافذة التقييم بعد الاستلام.
--
-- قبل هذه الهجرة كان التقييم متاحاً فور وصول الطلب إلى COMPLETED. المطلوب
-- تجارياً أن يُمهَل العميل يوماً كاملاً بعد الاستلام قبل أن يُطلب رأيه.
--
-- التوقيت مخزَّن في قاعدة البيانات لا في التطبيق: مؤقّت في الواجهة يموت مع
-- إغلاق التطبيق أو إعادة تشغيل الهاتف، أما عمود `rating_available_at` فيبقى
-- صحيحاً مهما انقطع العميل أو عاد بعد أسبوع.

ALTER TABLE orders
  -- لحظة تأكيد الاستلام فعلياً (الإدارة أو العميل) — لقطة تاريخية.
  ADD COLUMN delivered_at TIMESTAMPTZ,
  -- اللحظة التي يصبح فيها التقييم مسموحاً. تُحسب مرة واحدة عند الاستلام،
  -- فلا يتغيّر موعد فتح التقييم لطلب قديم إذا عُدّلت المهلة لاحقاً.
  ADD COLUMN rating_available_at TIMESTAMPTZ,
  -- حارس عدم التكرار لتذكير التقييم — تملؤه الجدولة مرة واحدة لكل طلب.
  ADD COLUMN rating_reminder_sent_at TIMESTAMPTZ,
  -- العمودان يُضبطان معاً أو لا يُضبطان إطلاقاً.
  ADD CONSTRAINT orders_rating_window_pair
    CHECK ((delivered_at IS NULL) = (rating_available_at IS NULL)),
  -- نافذة التقييم لا تسبق الاستلام أبداً.
  ADD CONSTRAINT orders_rating_after_delivery
    CHECK (rating_available_at IS NULL OR rating_available_at >= delivered_at),
  -- لا تذكير بلا نافذة تقييم.
  ADD CONSTRAINT orders_rating_reminder_needs_window
    CHECK (rating_reminder_sent_at IS NULL OR rating_available_at IS NOT NULL);

-- الطلبات المستلمة قبل هذه الهجرة: لحظة الاستلام من سجل الحالات، أو
-- updated_at كأقرب بديل إن غاب السجل.
--
-- العمودان يُملآن في جملة واحدة لأن قيد `orders_rating_window_pair` يفحص
-- كل صف عند تعديله: ملء delivered_at وحده يترك الصف مخالفاً لحظةً واحدة،
-- وهي كافية ليرفضها القيد.
--
-- والقيمة هي لحظة الاستلام نفسها لا الاستلام + مهلة: الطلبات القديمة تبقى
-- قابلة للتقييم فوراً. المهلة الجديدة تسري على ما يُستلم بعد الترقية فقط —
-- ترقية الخادم لا تسحب حقّاً كان بيد العميل بالأمس.
UPDATE orders o
   SET delivered_at = d.at,
       rating_available_at = d.at
  FROM (
    SELECT o2.id,
           COALESCE(
             (SELECT h.created_at FROM order_status_history h
               WHERE h.order_id = o2.id AND h.status = 'COMPLETED'
               ORDER BY h.created_at DESC LIMIT 1),
             o2.updated_at
           ) AS at
      FROM orders o2
     WHERE o2.status = 'COMPLETED' AND o2.delivered_at IS NULL
  ) d
 WHERE o.id = d.id;

-- وتُعلَّم كأنّ تذكيرها أُرسل، وإلا انهالت التذكيرات على كل عميل قديم في أول
-- دورة جدولة بعد النشر.
UPDATE orders
   SET rating_reminder_sent_at = now()
 WHERE status = 'COMPLETED'
   AND rating_available_at IS NOT NULL
   AND rating_reminder_sent_at IS NULL;

-- فهرس الجدولة: الطلبات المستحقة للتذكير فقط، لا مسح للجدول كله كل دورة.
CREATE INDEX idx_orders_rating_reminder_due
  ON orders (rating_available_at)
  WHERE status = 'COMPLETED' AND rating_reminder_sent_at IS NULL;
