-- 007_search_and_triggers.sql
-- بحث نصي جزئي (عربي) عبر pg_trgm. إذا لم يكن التوسيع متاحاً (صلاحيات)،
-- يبقى ILIKE يعمل دون index — ضعيف الأداء لكن صحيح من حيث السلوك.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON products USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_name_like
  ON products (name text_pattern_ops);

-- تحديث updated_at تلقائياً لكل الجداول ذات الطابع الزمني.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at  BEFORE UPDATE ON users        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_banners_updated_at  BEFORE UPDATE ON banners    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_governorates_updated_at BEFORE UPDATE ON governorates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_carts_updated_at    BEFORE UPDATE ON carts       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_orders_updated_at   BEFORE UPDATE ON orders      FOR EACH ROW EXECUTE FUNCTION set_updated_at();