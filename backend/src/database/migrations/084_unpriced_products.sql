-- 084_unpriced_products.sql
-- «قريباً — السعر يُعلن لاحقاً»: منتجٌ يُعلَن قبل تحديد سعره (STEP 69، 2026-10-24).
--
-- قرار المالك: السعر غير المعلن هو NULL — لا صفر ولا قيمةٌ نائبة. الصفر سعرٌ
-- (هديةٌ مجانية مثلاً، يرفضه مدقّق اللوحة أصلاً)، والـNULL «لم يُحدَّد بعد»؛
-- خلطهما كان سيبيع المنتج مجاناً لأول من يطلبه.
--
-- المنتج بلا سعر يُعرض ولا يُشترى: العربة والمعاينة والطلب ترفضه في الخادم
-- (`PRODUCT_NOT_PRICED`)، والكتالوج لا يعيده إلا لعميلٍ يطلبه صراحةً
-- (`X-OG-Unpriced: 1`) لأن التطبيق المثبَّت يقرأ السعر الغائب صفراً.
--
-- `products_price_check (price >= 0)` يبقى كما هو: NULL يمرّ منه. أما
-- `products_previous_price_higher (previous_price > price)` فيمرّ أيضاً حين
-- يكون السعر NULL — فشارة «كان ٩٠٠٠» على منتجٍ بلا سعر كانت ستُقبل. القيد
-- الجديد يمنعها. الصفوف القائمة كلها مسعَّرة، فالتحقّق منه فوري ولا يفشل.
--
-- أسعار الطلبات (`order_items.price`) لقطةٌ NOT NULL منفصلة — لا تتأثّر.

ALTER TABLE products ALTER COLUMN price DROP NOT NULL;

ALTER TABLE products
  ADD CONSTRAINT products_previous_price_needs_price
    CHECK (price IS NOT NULL OR previous_price IS NULL);
