-- 087_product_variants.sql
-- ألوان المنتج: لكل لونٍ صورته ومخزونه المستقل (STEP 74، طلب المالك 2026-10-27).
-- العقد كاملاً: docs/staging/color-variants-contract.md.
--
-- • المنتج «بألوان» متى كان له صفٌّ واحد على الأقل هنا (فعّالاً أو موقوفاً)؛
--   وإلا فهو منتجٌ قديم يبقى على `products.stock` كما كان حرفاً بحرف.
-- • لا لون يُختلق: الهجرة لا تُدرج صفّاً واحداً، ولا تمسّ مخزون أي منتج.
-- • `products.stock` لمنتجٍ بألوان **مشتقّ**: مجموع مخزون ألوانه الفعّالة، يحفظه
--   زناد هذه الهجرة داخل المعاملة نفسها. فكل قارئ قائم (الكتالوج، الإحصاءات،
--   «أعلمني عند توفره»، لقطة المخزون 080، التطبيقات الأقدم) يبقى صادقاً.
--   والكتابة المباشرة على `products.stock` لمنتجٍ بألوان تُرفض في القاعدة نفسها:
--   مخزونٌ واحد لا يُكتب من موضعين.
-- • سطر العربة يحمل لونه (`cart_items.variant_id`)، وهويّة السطر صارت
--   (العربة، المنتج، اللون، الخيار).
-- • بند الطلب يلتقط اللون وقت الطلب (المعرّف والاسم باللغتين ولون العيّنة)،
--   و`image_url` صورةُ اللون — تعديل اللون أو حذفه لاحقاً لا يغيّر طلباً قائماً.
--   `variant_id` بلا مفتاح أجنبي، مثل `product_id`: اللقطة تبقى ولو حُذف اللون.

CREATE TABLE product_variants (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color_name     TEXT NOT NULL
                 CHECK (color_name = btrim(color_name) AND char_length(color_name) BETWEEN 1 AND 40),
  color_name_ckb TEXT
                 CHECK (color_name_ckb IS NULL
                        OR (color_name_ckb = btrim(color_name_ckb) AND char_length(color_name_ckb) BETWEEN 1 AND 40)),
  color_hex      TEXT CHECK (color_hex IS NULL OR color_hex ~ '^#[0-9A-F]{6}$'),
  image_url      TEXT NOT NULL CHECK (char_length(image_url) BETWEEN 1 AND 500),
  stock          INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_variants_product ON product_variants (product_id, sort_order);

-- لونان باسمٍ واحد في منتجٍ واحد لا يُفرَّق بينهما عند الزبون ولا المسؤول.
CREATE UNIQUE INDEX uq_product_variants_color
  ON product_variants (product_id, lower(color_name));

CREATE FUNCTION touch_product_variant() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_product_variants_touch
  BEFORE UPDATE ON product_variants
  FOR EACH ROW EXECUTE FUNCTION touch_product_variant();

-- مخزون المنتج = مجموع ألوانه الفعّالة، بعد كل تغيير في مخزون لونٍ أو حاله.
CREATE FUNCTION sync_product_stock_from_variants() RETURNS TRIGGER AS $$
DECLARE
  target UUID;
BEGIN
  FOR target IN
    SELECT DISTINCT pid FROM (
      VALUES (CASE WHEN TG_OP <> 'INSERT' THEN OLD.product_id END),
             (CASE WHEN TG_OP <> 'DELETE' THEN NEW.product_id END)
    ) AS changed(pid)
    WHERE pid IS NOT NULL
  LOOP
    UPDATE products p
       SET stock = totals.stock
      FROM (SELECT COALESCE(SUM(v.stock), 0)::int AS stock
              FROM product_variants v
             WHERE v.product_id = target AND v.is_active) AS totals
     WHERE p.id = target AND p.stock IS DISTINCT FROM totals.stock;
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_product_variants_stock
  AFTER INSERT OR DELETE OR UPDATE OF stock, is_active, product_id ON product_variants
  FOR EACH ROW EXECUTE FUNCTION sync_product_stock_from_variants();

-- [CRITICAL] لا كتابة مباشرة لمخزون منتجٍ بألوان. العمق ١ = جملةٌ من التطبيق؛
-- الزناد أعلاه يكتب من العمق ٢ فيمرّ.
CREATE FUNCTION guard_variant_product_stock() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stock IS DISTINCT FROM OLD.stock
     AND pg_trigger_depth() = 1
     AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = NEW.id) THEN
    RAISE EXCEPTION 'stock of a product with colour variants is derived from its variants'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'products_stock_from_variants';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_variant_stock_guard
  BEFORE UPDATE OF stock ON products
  FOR EACH ROW EXECUTE FUNCTION guard_variant_product_stock();

-- ── العربة ──
ALTER TABLE cart_items
  ADD COLUMN variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE;

ALTER TABLE cart_items
  DROP CONSTRAINT cart_items_cart_product_option_key;
ALTER TABLE cart_items
  ADD CONSTRAINT cart_items_cart_product_variant_option_key
    UNIQUE NULLS NOT DISTINCT (cart_id, product_id, variant_id, option_value);

-- ── لقطة بند الطلب ──
ALTER TABLE order_items
  ADD COLUMN variant_id             UUID,
  ADD COLUMN variant_color_name     TEXT,
  ADD COLUMN variant_color_name_ckb TEXT,
  ADD COLUMN variant_color_hex      TEXT;

ALTER TABLE order_items
  ADD CONSTRAINT order_items_variant_snapshot
    CHECK ((variant_id IS NULL) = (variant_color_name IS NULL));

CREATE INDEX idx_order_items_variant ON order_items (variant_id) WHERE variant_id IS NOT NULL;
