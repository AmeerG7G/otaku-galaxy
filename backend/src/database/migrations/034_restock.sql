-- 034_restock.sql
-- «أخبرني عند توفره»: العميل يشترك بمنتج نافد المخزون، ويُخطَر داخل التطبيق
-- عندما يتغيّر مخزونه من صفر إلى ما فوق (بلا push — الإشعارات نصوص داخلية
-- فقط كما وُثّق في الهجرة ٠١٢).
--
-- restock_at — تاريخ يُدخله المسؤول: «سيعود للتوفر بتاريخ…». معلومة إرشادية
-- فقط: لا تغيّر المخزون ولا تصنع إشعاراً من تلقاء نفسها.

ALTER TABLE products ADD COLUMN restock_at TIMESTAMPTZ;

CREATE TABLE restock_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX idx_restock_subscriptions_product
  ON restock_subscriptions (product_id, created_at);