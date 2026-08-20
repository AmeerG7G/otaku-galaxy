-- 004_storefront.sql
CREATE TABLE banners (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url           TEXT NOT NULL,
  title               TEXT,
  destination_type    TEXT NOT NULL CHECK (destination_type IN ('product', 'category', 'subcategory', 'none')),
  destination_value   TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_banners_active ON banners (is_active, sort_order) WHERE is_active = TRUE;

CREATE TABLE governorates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL UNIQUE,
  delivery_fee NUMERIC(12,2) NOT NULL CHECK (delivery_fee >= 0),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_governorates_active ON governorates (sort_order) WHERE is_active = TRUE;