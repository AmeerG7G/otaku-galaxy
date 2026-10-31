-- 088 — «أعلمني عند توفر هذا اللون» (STEP 76، القرار D3).
--
-- اشتراك بلونٍ بعينه في منتجٍ بألوان (087). جدولٌ مستقل عن
-- `restock_subscriptions` عمداً:
-- • اشتراكات المنتج كله (التطبيق المثبَّت) لا يمسّها شيء — لا عمود جديد ولا
--   قيد فريد مبدَّل. الإصدار السابق من الخادم يعمل على القاعدة بعد هذه الهجرة
--   حرفاً بحرف (`ON CONFLICT (user_id, product_id)` يبقى صالحاً).
-- • الاشتراك يُستهلك بإشعارٍ واحد حين يصير **هذا اللون** متاحاً (فعّالاً
--   بمخزونٍ موجب، والمنتج فعّالاً ومُسعَّراً) — لا حين يعود مجموع المنتج.
--
-- الرجوع: `DROP TABLE restock_variant_subscriptions;` — لا جدول آخر يشير إليه،
-- والإصدار السابق لا يقرؤه.

CREATE TABLE restock_variant_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- اشتراكٌ واحد لكل زبونٍ ولون: الضغطة المكرّرة لا تُنشئ صفّاً ثانياً.
  CONSTRAINT uq_restock_variant_user UNIQUE (user_id, variant_id)
);

-- مسار التبليغ: مشتركو لونٍ بعينه، ومشتركو ألوان منتجٍ واحد بعد حفظه.
CREATE INDEX idx_restock_variant_subscriptions_variant
  ON restock_variant_subscriptions (variant_id, created_at);
CREATE INDEX idx_restock_variant_subscriptions_product
  ON restock_variant_subscriptions (product_id);
