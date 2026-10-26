-- 077_order_item_snapshots.sql
-- لقطة القسم والسعر المعلَن على بند الطلب ساعة إنشائه.
--
-- ═══════════════ القرار (2026-10-03، STEP 67) ═══════════════
--
-- بند الطلب يحفظ اسم المنتج وسعره المدفوع منذ ٠٠٦، لا قسمه ولا سعره «قبل
-- العرض». نقلُ منتجٍ إلى قسمٍ آخر لاحقاً كان سينقل مبيعاته التاريخية معه.
--
--   category_id / subcategory_id — قسم المنتج ساعة الطلب؛
--   list_price — السعر المعلَن ساعة الطلب: `previous_price` إن كان المنتج في
--                عرضٍ مشطوب، وإلا سعره نفسه. «التخفيض الترويجي» =
--                (list_price − price) × الكمية، ولا يُحسب إلا لبنودٍ تحمل اللقطة.
--
-- [CRITICAL] لا تعبئة للبنود القديمة: نسخ القسم أو السعر **الحاليين** إلى طلبٍ
-- قديم كتابةٌ لتاريخٍ لم يحدث. NULL = «لم تُلتقط ساعة الطلب»، فتُنسب مبيعات
-- البند القديم إلى القسم الحالي **بإفصاحٍ صريح** (`lines_basis_current`)، ولا
-- يدخل التخفيض الترويجي.
--
-- الزناد يكتب اللقطة لكل طريق إدراج (قراءةٌ عادية لصفّ المنتج — إنشاء الطلب لا
-- يقفل شيئاً، وفق عقد المخزون)، ولا تتغيّر اللقطة بعدها. لا FK على القسم: حذف
-- قسمٍ فارغ لاحقاً لا يمحو تاريخ بنوده (كما `product_id` منذ ٠٠٦).

ALTER TABLE order_items
  ADD COLUMN category_id    UUID,
  ADD COLUMN subcategory_id UUID,
  ADD COLUMN list_price     NUMERIC(12,2) CHECK (list_price IS NULL OR list_price >= 0);

CREATE FUNCTION snapshot_order_item_catalog() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT p.category_id, p.subcategory_id, COALESCE(p.previous_price, p.price)
      INTO NEW.category_id, NEW.subcategory_id, NEW.list_price
      FROM products p
     WHERE p.id = NEW.product_id;
  ELSIF (NEW.category_id, NEW.subcategory_id, NEW.list_price)
        IS DISTINCT FROM (OLD.category_id, OLD.subcategory_id, OLD.list_price) THEN
    RAISE EXCEPTION 'order item catalog snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_items_catalog_snapshot
  BEFORE INSERT OR UPDATE OF category_id, subcategory_id, list_price ON order_items
  FOR EACH ROW EXECUTE FUNCTION snapshot_order_item_catalog();
