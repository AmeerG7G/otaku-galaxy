-- 013_birthday.sql
-- عيد الميلاد على الخادم بدل SharedPreferences، مع فرض «مرة واحدة» فعلياً.

ALTER TABLE users
  ADD COLUMN birth_day   INTEGER CHECK (birth_day   IS NULL OR birth_day   BETWEEN 1 AND 31),
  ADD COLUMN birth_month INTEGER CHECK (birth_month IS NULL OR birth_month BETWEEN 1 AND 12),
  ADD COLUMN birthday_set_at TIMESTAMPTZ,
  -- اليوم والشهر يُضبطان معاً أو لا يُضبطان إطلاقاً.
  ADD CONSTRAINT users_birthday_pair
    CHECK ((birth_day IS NULL) = (birth_month IS NULL));

-- استهلاك خصم الميلاد: صفّ واحد لكل عميل لكل سنة ميلادية.
-- القيد الفريد هو ما يمنع إعادة الاستخدام — لا نعتمد على شرط في الواجهة.
CREATE TABLE birthday_discount_usage (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  used_year    INTEGER NOT NULL,
  amount       NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, used_year)
);

CREATE INDEX idx_birthday_usage_user ON birthday_discount_usage (user_id);
