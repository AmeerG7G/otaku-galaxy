-- 016_promotions.sql
-- بيانات العروض الحقيقية التي تحتاجها بطاقات Otaku Galaxy v2:
-- السعر السابق (للشطب) ونسبة الخصم المشتقة منه، وترويج التوصيل.
-- لا تُعرض أي شارة ما لم توجد بيانات حقيقية تدعمها.

ALTER TABLE products
  ADD COLUMN previous_price NUMERIC(12,2) CHECK (previous_price IS NULL OR previous_price >= 0),
  ADD COLUMN has_delivery_promo BOOLEAN NOT NULL DEFAULT FALSE,
  -- السعر السابق يجب أن يكون أعلى من الحالي وإلا فلا معنى للخصم.
  ADD CONSTRAINT products_previous_price_higher
    CHECK (previous_price IS NULL OR previous_price > price);

-- نسبة الخصم محسوبة دائماً من السعرين — لا يمكن إدخال نسبة وهمية يدوياً.
CREATE OR REPLACE FUNCTION product_discount_percent(prev NUMERIC, current_price NUMERIC)
RETURNS INTEGER AS $$
BEGIN
  IF prev IS NULL OR prev <= 0 OR current_price IS NULL OR current_price >= prev THEN
    RETURN NULL;
  END IF;
  RETURN ROUND(((prev - current_price) / prev) * 100)::int;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
