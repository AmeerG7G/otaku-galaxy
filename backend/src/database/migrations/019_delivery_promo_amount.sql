-- 019_delivery_promo_amount.sql
-- ترويج التوصيل بقيمة قابلة للضبط بدل علم منطقي فقط.
--
-- تصميم Otaku Galaxy v2 يخصم مبلغاً من رسوم التوصيل عن كل قطعة من المنتجات
-- المؤهَّلة («خصم التوصيل»، وحتى «توصيل مجاني» إن غطّى الخصم الرسوم كلها).
-- المبلغ هو القيمة المعتمدة تجارياً؛ يبقى has_delivery_promo كمفتاح تفعيل
-- سريع للوحة الإدارة، لكن الحساب يعتمد المبلغ.

ALTER TABLE products
  ADD COLUMN delivery_promo_amount NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (delivery_promo_amount >= 0);

-- المنتجات التي فُعِّل عليها الترويج سابقاً بلا مبلغ تأخذ القيمة الافتراضية
-- المذكورة في التصميم (١٬٠٠٠ د.ع لكل قطعة)، فلا يتغيّر سلوكها الظاهر.
UPDATE products
   SET delivery_promo_amount = 1000
 WHERE has_delivery_promo = TRUE
   AND delivery_promo_amount = 0;

-- تماسك: الترويج مفعَّل ⇔ المبلغ أكبر من صفر. يمنع حالة «مفعَّل بلا قيمة»
-- التي تعرض شارة لا تُترجم إلى خصم فعلي.
ALTER TABLE products
  ADD CONSTRAINT products_delivery_promo_amount_positive
    CHECK (
      (has_delivery_promo = FALSE AND delivery_promo_amount = 0)
      OR (has_delivery_promo = TRUE AND delivery_promo_amount > 0)
    );

-- لقطة تاريخية على الطلب: الخصم المطبَّق فعلاً وقت الإنشاء. تغيير ترويج
-- المنتج لاحقاً يجب ألّا يغيّر أي طلب سابق.
ALTER TABLE orders
  ADD COLUMN delivery_discount NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (delivery_discount >= 0),
  -- الخصم لا يتجاوز رسوم التوصيل — التوصيل لا يصير سالباً أبداً.
  ADD CONSTRAINT orders_delivery_discount_within_fee
    CHECK (delivery_discount <= delivery_fee);
