-- 071_order_idempotency.sql
-- مفتاح عدم التكرار لإرسال الطلب (`Idempotency-Key`) — اختياري، إضافيّ بالكامل.
--
-- ═══ ما يعالجه ═══
-- العربة المقفولة هي اليوم «مفتاح» عدم التكرار الضمني: إرسالان متزامنان لعربةٍ
-- واحدة يُنتجان طلباً واحداً. لكن إعادة المحاولة بعد ضياع الردّ (الخادم التزم
-- والعميل لم يستلم) تصل عربةً فارغة فتعود `400 EMPTY_CART` — نتيجةٌ ملتبسة لا
-- تقول إن الطلب أُنشئ. ومسارٌ يملأ العربة بين محاولتين (واجهة الويب ووسيطها)
-- يُنشئ طلباً ثانياً. المفتاح يربط إعادة المحاولة بمحاولتها الأولى.
--
-- ═══ لماذا على صفّ الطلب لا في جدول مستقل ═══
-- المفتاح موجود **إن وفقط إن** التزم الطلب: محاولةٌ تراجعت لا تترك أثراً فتُعاد
-- طبيعياً، ولا مهمّة تنظيف، والإعادة تقرأ الطلب نفسه. الطلبات القديمة والطلبات
-- بلا مفتاح تبقى `NULL` — والفهرس الجزئي لا يراها.
--
-- ═══ أمان النشر ═══
-- إضافة أعمدة فارغة بلا افتراضي: تعديلُ فهرس النظام وحده، بلا إعادة كتابة.
-- النسخة السابقة من الخادم لا تقرأ العمودين ولا تكتبهما، فالهجرة تسبق النشر
-- بأمان. القيدان يُفحصان على صفوفٍ كلها `NULL` الآن.
-- التراجع: الكود أولاً، ثم `DROP INDEX` و`DROP CONSTRAINT` و`DROP COLUMN`.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_fingerprint TEXT;

ALTER TABLE orders
  ADD CONSTRAINT orders_idempotency_key_format
    CHECK (idempotency_key IS NULL OR idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  ADD CONSTRAINT orders_idempotency_pair
    CHECK ((idempotency_key IS NULL) = (idempotency_fingerprint IS NULL));

-- [CRITICAL] الحارس الحقيقي: طلبٌ واحد على الأكثر لكل (زبون، مفتاح). المفتاح
-- مربوطٌ بصاحبه — مفتاحٌ يطابق مفتاح زبونٍ آخر لا يلمس طلبه أبداً.
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_user_idempotency_key
  ON orders (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
