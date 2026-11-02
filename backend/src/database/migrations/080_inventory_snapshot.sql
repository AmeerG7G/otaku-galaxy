-- 080_inventory_snapshot.sql
-- لقطة مخزون يومية — مصدر «أيام النفاد» و«دوران المخزون» من تاريخ أول لقطة.
--
-- ═══════════════ القرار (2026-10-03، STEP 67) ═══════════════
--
-- المخزون عمودٌ حالي في `products` لا تاريخ له: «كم يوماً نفد المنتج الشهر
-- الماضي» لا يُعرف من البيانات القائمة. مهمّة التحليلات تكتب هنا مرة يومياً
-- (بيوم المتجر) لكل منتج. الدوران ونفاد المخزون لا يُعرضان إلا لفتراتٍ تغطيها
-- اللقطات بالكامل — ولا تُختلق لقطاتٌ لأيامٍ سابقة.
--
-- اللقطة لا تتغيّر ولا تُحذف بعد كتابتها.

CREATE TABLE inventory_daily_snapshot (
  snapshot_date DATE NOT NULL,
  product_id    UUID NOT NULL,
  stock         INTEGER NOT NULL CHECK (stock >= 0),
  is_active     BOOLEAN NOT NULL,
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_date, product_id)
);

CREATE FUNCTION forbid_change_inventory_snapshot() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'inventory_daily_snapshot rows are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inventory_daily_snapshot_immutable
  BEFORE UPDATE OR DELETE ON inventory_daily_snapshot
  FOR EACH ROW EXECUTE FUNCTION forbid_change_inventory_snapshot();
