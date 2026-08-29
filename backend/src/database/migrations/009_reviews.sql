-- 009_reviews.sql
-- تقييمات العملاء مع دورة مراجعة إدارية (بانتظار → معتمد/مرفوض).
-- تحلّ محل LocalReviewRepository في تطبيق فلاتر.

CREATE TABLE reviews (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  -- بدون FK على المنتج: يبقى التقييم تاريخياً حتى لو حُذف المنتج.
  product_id       UUID,
  product_name     TEXT NOT NULL,
  rating           INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment          TEXT NOT NULL DEFAULT '',
  photo_url        TEXT,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  -- لقطة اسم العميل وقت التقييم (يُعرض في المتجر بلا بيانات خاصة أخرى).
  customer_name    TEXT NOT NULL,
  reviewed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- تقييم واحد لكل منتج ضمن كل طلب.
  UNIQUE (order_id, product_id),
  -- سبب الرفض إلزامي عند الرفض فقط.
  CONSTRAINT reviews_rejection_reason_required
    CHECK (status <> 'rejected' OR (rejection_reason IS NOT NULL AND char_length(btrim(rejection_reason)) > 0))
);

CREATE INDEX idx_reviews_user ON reviews (user_id, created_at DESC);
CREATE INDEX idx_reviews_product_approved
  ON reviews (product_id, created_at DESC) WHERE status = 'approved';
CREATE INDEX idx_reviews_pending
  ON reviews (created_at) WHERE status = 'pending';
-- تغذية شاشة المجتمع: التقييمات المعتمدة المصحوبة بصورة.
CREATE INDEX idx_reviews_community
  ON reviews (created_at DESC) WHERE status = 'approved' AND photo_url IS NOT NULL;

CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- إعادة احتساب متوسط التقييم وعدده على المنتج من التقييمات المعتمدة فقط.
CREATE OR REPLACE FUNCTION refresh_product_rating(target_product UUID) RETURNS void AS $$
BEGIN
  IF target_product IS NULL THEN RETURN; END IF;
  UPDATE products p
     SET rating = sub.avg_rating,
         review_count = sub.cnt
    FROM (
      SELECT ROUND(AVG(rating)::numeric, 1) AS avg_rating, COUNT(*)::int AS cnt
      FROM reviews
      WHERE product_id = target_product AND status = 'approved'
    ) sub
   WHERE p.id = target_product;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reviews_sync_product_rating() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_product_rating(OLD.product_id);
    RETURN OLD;
  END IF;
  PERFORM refresh_product_rating(NEW.product_id);
  IF TG_OP = 'UPDATE' AND OLD.product_id IS DISTINCT FROM NEW.product_id THEN
    PERFORM refresh_product_rating(OLD.product_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reviews_sync_rating
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION reviews_sync_product_rating();
