-- 008_orders_item_image.sql
-- لقطة إضافية: صورة المنتج وقت الطلب (تُعرض في قائمة الطلبات حتى لو تغيّر المنتج لاحقاً).
ALTER TABLE order_items
  ADD COLUMN image_url text;