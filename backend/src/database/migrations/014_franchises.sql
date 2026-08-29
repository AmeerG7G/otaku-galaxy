-- 014_franchises.sql
-- الأنمي/الامتياز بُعد تصنيف مستقل عن الأقسام: منتج واحد قد ينتمي لعدة
-- امتيازات، والامتياز الواحد يجمع منتجات من أقسام مختلفة.

CREATE TABLE franchises (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  image_url  TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_franchises_active ON franchises (sort_order) WHERE is_active = TRUE;

CREATE TABLE product_franchises (
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  franchise_id UUID NOT NULL REFERENCES franchises(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, franchise_id)
);

CREATE INDEX idx_product_franchises_franchise ON product_franchises (franchise_id);

CREATE TRIGGER trg_franchises_updated_at
  BEFORE UPDATE ON franchises FOR EACH ROW EXECUTE FUNCTION set_updated_at();
