-- 046_cart_unique_null_option.sql
-- تفرّد سطر العربة حين لا خيار للمنتج.
--
-- [CRITICAL] عطبُ تجاوزِ المخزون. القيد كان
-- `UNIQUE (cart_id, product_id, option_value)`، وفي PostgreSQL القيمة NULL
-- **لا تساوي NULL** داخل فهرس فريد. فالمنتج بلا خيارات (`option_value IS
-- NULL`) لا يصطدم بنفسه أبداً: كل إضافة تُنشئ صفّاً جديداً بدل أن تُدمَج،
-- و`ON CONFLICT … DO UPDATE` في `cartRepo.upsertItem` لا يعمل إطلاقاً.
--
-- وأثرُه ليس تجميلياً: حارس المخزون في `cartService.addItem` يقرأ سطراً
-- واحداً مطابقاً فيحسب أقلّ من الحقيقة، و`orderService.create` يتحقّق من كل
-- سطر على حدة فيمرّ المجموع. المقيس على قاعدة التطوير: منتج مخزونه ٣ خرج
-- منه طلبٌ بخمس قطع (٢٠١ Created)، والمخزون هبط إلى صفر بدل −٢ — أي أن
-- المتجر باع قطعتين لا يملكهما.
--
-- `NULLS NOT DISTINCT` (متاح منذ PostgreSQL 15؛ الخادم هنا ١٦) يجعل NULL
-- تساوي NULL في هذا الفهرس، فيعود الدمج يعمل كما كان مقصوداً منذ البداية.

-- الأسطر المكرّرة القائمة تُدمج قبل فرض القيد: حذفُها كان سيُنقص عرباتِ
-- زبائن، ودمجُها يحفظ ما اختاروه.
WITH merged AS (
  SELECT cart_id,
         product_id,
         option_value,
         SUM(quantity)          AS total_quantity,
         MIN(id::text)::uuid    AS keep_id
    FROM cart_items
   GROUP BY cart_id, product_id, option_value
  HAVING COUNT(*) > 1
)
UPDATE cart_items ci
   SET quantity = m.total_quantity
  FROM merged m
 WHERE ci.id = m.keep_id;

WITH merged AS (
  SELECT cart_id,
         product_id,
         option_value,
         MIN(id::text)::uuid AS keep_id
    FROM cart_items
   GROUP BY cart_id, product_id, option_value
  HAVING COUNT(*) > 1
)
DELETE FROM cart_items ci
 USING merged m
 WHERE ci.cart_id = m.cart_id
   AND ci.product_id = m.product_id
   AND ci.option_value IS NOT DISTINCT FROM m.option_value
   AND ci.id <> m.keep_id;

ALTER TABLE cart_items
  DROP CONSTRAINT IF EXISTS cart_items_cart_id_product_id_option_value_key;

ALTER TABLE cart_items
  ADD CONSTRAINT cart_items_cart_product_option_key
    UNIQUE NULLS NOT DISTINCT (cart_id, product_id, option_value);
