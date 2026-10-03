-- 078_purchase_costs.sql
-- تكلفة الشراء: سجلٌّ تاريخي يُلحق ولا يُعدَّل، ولقطةٌ على بند الطلب تُكتب مرة واحدة.
--
-- ═══════════════ القرار (2026-10-03، STEP 67، D1) ═══════════════
--
-- مصدر الحقيقة `product_cost_entries`: كل تكلفةٍ جديدة صفٌّ جديد بختم وقت
-- الخادم (لا تأريخ رجعي). التكلفة الحالية = آخر صف. لا تعديل ولا حذف — التصحيح
-- صفٌّ جديد يسري **من الآن فصاعداً**.
--
-- لحظة اللقطة: حين يُقبل الطلب ويُخصم مخزونه (`consumeStockOnApproval`، تحت
-- أقفال الطلب والمنتجات نفسها) يحمل كل بند `unit_cost` و`cost_entry_id` (الصف
-- المرجعي بعينه) و`cost_captured_at`. هذا وقت خروج البضاعة من المخزون فعلاً.
-- اللقطة تُكتب مرة واحدة: تغيير تكلفة المنتج لاحقاً لا يمسّ ربح أي طلبٍ سابق،
-- وإعادة بناء التحليلات تقرأ اللقطات ولا تعيد حسابها من التكلفة الحالية.
--
-- [CRITICAL] لا تعبئة: الطلبات المقبولة قبل هذه الهجرة، وبنود منتجاتٍ بلا تكلفة
-- مسجّلة ساعة القبول، تبقى NULL للأبد — «الربح غير متاح». لا تُنسخ تكلفةٌ حالية
-- إلى الماضي، ولا يُختلق ربح.

CREATE TABLE product_cost_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  unit_cost      NUMERIC(12,2) NOT NULL CHECK (unit_cost > 0),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  entered_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  note           TEXT CHECK (note IS NULL OR char_length(note) <= 200),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- «التكلفة السارية» = أحدث صفٍّ للمنتج.
CREATE INDEX idx_product_cost_entries_current
  ON product_cost_entries (product_id, effective_from DESC, created_at DESC, id DESC);

CREATE FUNCTION guard_product_cost_entry() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- وقت الخادم وحده: لا تأريخ رجعي ولا مستقبلي.
    NEW.effective_from := now();
    NEW.created_at := now();
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'product cost entries are append-only';
  END IF;
  -- حذف حساب المسؤول يفرّغ `entered_by` (SET NULL) — التغيير الوحيد المسموح.
  IF (NEW.id, NEW.product_id, NEW.unit_cost, NEW.effective_from, NEW.note, NEW.created_at)
       IS DISTINCT FROM (OLD.id, OLD.product_id, OLD.unit_cost, OLD.effective_from, OLD.note, OLD.created_at)
     OR (NEW.entered_by IS DISTINCT FROM OLD.entered_by AND NEW.entered_by IS NOT NULL) THEN
    RAISE EXCEPTION 'product cost entries are append-only';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_product_cost_entries_guard
  BEFORE INSERT OR UPDATE OR DELETE ON product_cost_entries
  FOR EACH ROW EXECUTE FUNCTION guard_product_cost_entry();

ALTER TABLE order_items
  ADD COLUMN unit_cost        NUMERIC(12,2) CHECK (unit_cost IS NULL OR unit_cost > 0),
  ADD COLUMN cost_entry_id    UUID REFERENCES product_cost_entries(id) ON DELETE RESTRICT,
  ADD COLUMN cost_captured_at TIMESTAMPTZ,
  ADD CONSTRAINT order_items_cost_snapshot_complete
    CHECK ((unit_cost IS NULL) = (cost_entry_id IS NULL)
           AND (unit_cost IS NULL) = (cost_captured_at IS NULL));

CREATE INDEX idx_order_items_cost_entry ON order_items (cost_entry_id) WHERE cost_entry_id IS NOT NULL;

-- اللقطة: لا تُكتب عند الإدراج، وتُكتب مرة واحدة مطابقةً لصفّ تكلفةٍ للمنتج نفسه.
CREATE FUNCTION guard_order_item_cost_snapshot() RETURNS TRIGGER AS $$
DECLARE
  entry RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.unit_cost IS NOT NULL OR NEW.cost_entry_id IS NOT NULL OR NEW.cost_captured_at IS NOT NULL THEN
      RAISE EXCEPTION 'order item cost is captured at approval, not at insert';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.unit_cost, NEW.cost_entry_id, NEW.cost_captured_at)
     IS NOT DISTINCT FROM (OLD.unit_cost, OLD.cost_entry_id, OLD.cost_captured_at) THEN
    RETURN NEW;
  END IF;
  IF OLD.cost_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'order item cost snapshot is write-once';
  END IF;
  SELECT e.product_id, e.unit_cost INTO entry FROM product_cost_entries e WHERE e.id = NEW.cost_entry_id;
  IF entry.product_id IS DISTINCT FROM NEW.product_id OR entry.unit_cost IS DISTINCT FROM NEW.unit_cost THEN
    RAISE EXCEPTION 'order item cost snapshot must match its cost entry';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_items_cost_snapshot
  BEFORE INSERT OR UPDATE OF unit_cost, cost_entry_id, cost_captured_at ON order_items
  FOR EACH ROW EXECUTE FUNCTION guard_order_item_cost_snapshot();
