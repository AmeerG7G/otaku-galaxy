-- 006_orders.sql
CREATE SEQUENCE order_number_seq START 1;

CREATE TABLE orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number           TEXT NOT NULL UNIQUE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  governorate_id   UUID NOT NULL REFERENCES governorates(id) ON DELETE RESTRICT,
  province         TEXT NOT NULL,
  full_address     TEXT NOT NULL,
  phone            TEXT NOT NULL CHECK (phone ~ '^07[0-9]{9}$'),
  products_total   NUMERIC(12,2) NOT NULL CHECK (products_total >= 0),
  delivery_fee     NUMERIC(12,2) NOT NULL CHECK (delivery_fee >= 0),
  discount         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total            NUMERIC(12,2) NOT NULL CHECK (total >= 0),
  status           TEXT NOT NULL DEFAULT 'PENDING_ADMIN_CONFIRMATION'
                   CHECK (status IN ('PENDING_ADMIN_CONFIRMATION','CONFIRMED','PREPARING','OUT_FOR_DELIVERY','COMPLETED','REJECTED')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_user ON orders (user_id, created_at DESC);
CREATE INDEX idx_orders_status ON orders (status, created_at DESC) WHERE status = 'PENDING_ADMIN_CONFIRMATION';

CREATE TABLE order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  -- بدون FK على المنتج: نُبقي السجل التاريخي حتى لو حُذف المنتج لاحقاً.
  product_id    UUID,
  product_name  TEXT NOT NULL,
  price         NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  option_value  TEXT,
  quantity      INTEGER NOT NULL CHECK (quantity >= 1),
  line_total    NUMERIC(12,2) NOT NULL CHECK (line_total >= 0)
);

CREATE INDEX idx_order_items_order ON order_items (order_id);

CREATE TABLE order_status_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  note       TEXT,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_status_history_order ON order_status_history (order_id, created_at);