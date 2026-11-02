-- يعكس 090_product_variant_kind.sql — يُسقط عمودَي النوع وقيدَيهما (تسقط معهما).
-- [CRITICAL] يرفض العمل متى وُجد منتجٌ أو سطرُ طلبٍ نوعه غير «لون»:
-- العكس حينها يعيد تسمية خيارات التصميم والمقاس «لوناً» بصمت، في المتجر وفي
-- الطلبات المحفوظة. قبل أول نوعٍ آخر يعيد المخطّط كما كان بلا فقدان شيء. من
-- أراد العكس رغم ذلك يعيد تلك المنتجات والسطور `color` عن قصدٍ أولاً. لقطة
-- `color` (كل سطرٍ بخيارٍ بعد 090) لا تمنع: بلا العمود يُقرأ السطر لوناً كما هو.
-- معاملةٌ واحدة: الكل أو لا شيء.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM products WHERE variant_kind <> 'color')
     OR EXISTS (SELECT 1 FROM order_items WHERE variant_kind <> 'color') THEN
    RAISE EXCEPTION '090 rollback refused: design/size products or order items exist';
  END IF;
END;
$$;
ALTER TABLE order_items DROP COLUMN IF EXISTS variant_kind;
ALTER TABLE products DROP COLUMN IF EXISTS variant_kind;
DELETE FROM schema_migrations WHERE name = '090_product_variant_kind.sql';
COMMIT;
