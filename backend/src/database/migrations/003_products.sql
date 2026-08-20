-- 003_products.sql
CREATE TABLE products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  subcategory_id UUID REFERENCES subcategories(id) ON DELETE SET NULL,
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  description   TEXT NOT NULL DEFAULT '',
  price         NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  stock         INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  -- العروض والمنتجات المختارة يديرها المسؤول:
  is_offer      BOOLEAN NOT NULL DEFAULT FALSE,
  offer_rank    INTEGER,
  is_selected   BOOLEAN NOT NULL DEFAULT FALSE,
  selected_rank INTEGER,
  -- تقييم إجمالي (يديره المسؤول حالياً):
  rating        NUMERIC(2,1) CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
  review_count  INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_category ON products (category_id) WHERE is_active = TRUE;
CREATE INDEX idx_products_subcategory ON products (subcategory_id) WHERE is_active = TRUE;
CREATE INDEX idx_products_offer ON products (offer_rank NULLS LAST) WHERE is_offer = TRUE AND is_active = TRUE;
CREATE INDEX idx_products_selected ON products (selected_rank NULLS LAST) WHERE is_selected = TRUE AND is_active = TRUE;

CREATE TABLE product_images (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_product_images_product ON product_images (product_id, sort_order);

CREATE TABLE product_options (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  values     TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_options_product ON product_options (product_id);