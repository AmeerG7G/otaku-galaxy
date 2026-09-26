-- 056_list_ordering_and_ledger_indexes.sql
--
-- فهارس تدقيق الأداء (#5) — كلها مقيسة على بيانات بحجم متجرٍ بعد سنة
-- (عشرة آلاف طلب وإشعار) بخطط التنفيذ الفعلية، لا بتقدير.
--
-- • قائمتا الإدارة (الطلبات، الإشعارات) تُرتَّبان بالأحدث وتُقطَّعان
--   بـ`LIMIT`. بلا فهرسٍ على `created_at` كانت الصفحة الأولى مسحاً كاملاً
--   للجدول ثم فرزاً ثم قطعاً: ~١٠٠ مللي ثانية لصفحة الطلبات عند عشرة آلاف
--   طلب، وتنمو خطّياً. بالفهرس تُقرأ العشرون الأولى وحدها (~١ مللي ثانية).
--   الفهرس الجزئي القائم على الطلبات المنتظرة يبقى — يخدم شارة الانتظار.
--
-- • في اعتماد التقييم (تحت قفل صفّ الطلب) يُقرأ ما مُنح عن الطلب من نقاط
--   تقييم بـ`order_id`، وعند الرفض تُحذف نقاط التقييم بـ`review_id`. لا
--   فهرس يبدأ بأيٍّ منهما — الفهارس الفريدة تبدأ بـ`user_id` — فكانا مسحاً
--   كاملاً للدفتر داخل معاملةٍ تحمل قفلاً. جزئيّان على غير الفارغ: سطور
--   الشراء اليدوية بلا مراجع لا تهمّ هذين المسارين.

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_points_ledger_order
  ON points_ledger (order_id) WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_points_ledger_review
  ON points_ledger (review_id) WHERE review_id IS NOT NULL;
