-- 015_delivery_zones.sql
-- مناطق التوصيل داخل المحافظة بأسعار مستقلة فعلياً.
-- النجف تستخدم منطقتين (داخل/خارج القضاء) وقد تختلف رسومهما.
-- قبل هذه الهجرة كانت المنطقة تُلصق بنص العنوان بلا أي أثر على السعر.

CREATE TABLE governorate_zones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  governorate_id UUID NOT NULL REFERENCES governorates(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  delivery_fee   NUMERIC(12,2) NOT NULL CHECK (delivery_fee >= 0),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (governorate_id, name)
);

CREATE INDEX idx_governorate_zones_gov
  ON governorate_zones (governorate_id, sort_order) WHERE is_active = TRUE;

CREATE TRIGGER trg_governorate_zones_updated_at
  BEFORE UPDATE ON governorate_zones FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- الطلب يحفظ المنطقة المختارة كمرجع + لقطة نصية للسجل التاريخي.
ALTER TABLE orders
  ADD COLUMN zone_id   UUID REFERENCES governorate_zones(id) ON DELETE SET NULL,
  ADD COLUMN zone_name TEXT;

-- مناطق النجف الافتراضية بنفس رسوم المحافظة الحالية (لا تغيير في الأسعار
-- عند الترقية؛ يعدّلها المسؤول من لوحة التحكم لاحقاً).
INSERT INTO governorate_zones (governorate_id, name, delivery_fee, sort_order)
SELECT g.id, z.name, g.delivery_fee, z.sort_order
FROM governorates g
CROSS JOIN (VALUES ('داخل قضاء النجف', 0), ('خارج قضاء النجف', 1)) AS z(name, sort_order)
WHERE g.name LIKE '%النجف%'
ON CONFLICT (governorate_id, name) DO NOTHING;
