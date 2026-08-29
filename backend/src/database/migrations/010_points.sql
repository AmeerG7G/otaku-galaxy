-- 010_points.sql
-- دفتر نقاط المجرّة: سجل حركات فقط، والرصيد مشتق منه (لا عمود رصيد مكرّر).
-- يحلّ محل LocalPointsRepository في تطبيق فلاتر.

CREATE TABLE points_ledger (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- النص المعروض للعميل في «سجل النقاط».
  label       TEXT NOT NULL,
  amount      INTEGER NOT NULL CHECK (amount <> 0),
  -- سبب آلي للمنح، يُستخدم لمنع التكرار.
  reason      TEXT NOT NULL
              CHECK (reason IN ('order_received', 'review_approved', 'review_with_photo', 'manual')),
  order_id    UUID REFERENCES orders(id) ON DELETE SET NULL,
  review_id   UUID REFERENCES reviews(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_points_ledger_user ON points_ledger (user_id, created_at DESC);

-- منع منح النقاط مرتين لنفس الحدث (استلام الطلب / اعتماد التقييم).
CREATE UNIQUE INDEX uq_points_order_received
  ON points_ledger (user_id, order_id) WHERE reason = 'order_received';
CREATE UNIQUE INDEX uq_points_review
  ON points_ledger (user_id, review_id, reason)
  WHERE review_id IS NOT NULL;
