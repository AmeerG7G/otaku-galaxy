-- ما تمثّله خيارات المنتج (STEP 77): لون، أو تصميم، أو مقاس.
--
-- نظام الخيارات (087) نفسه — صورةٌ ومخزونٌ لكل خيار — صار يمثّل التصميم
-- (حقيبة «سوكونا» و«غوكو») والمقاس، لا اللون وحده. ما ينقصه أن يعرف الزبون
-- ماذا يختار: «اللون» على خيارات تصميمٍ تضليل. النوع على المنتج لا على
-- الخيار: محدّدٌ واحد بعُدٍ واحد، فلا يُخلط لونٌ بمقاس في قائمة واحدة.
--
-- لا إعادة تسمية: أعمدة `color_*` وحقول `colorName*` تبقى بأسمائها، فالتطبيق
-- الأقدم يعمل كما هو (يرى «اللون» كما كان).
--
--   products.variant_kind      — الافتراضي `color`: كل منتجٍ قائم بألوانٍ
--                                 يبقى كما كان بلا ترحيل بيانات.
--   order_items.variant_kind   — لقطة النوع لحظة الطلب. NULL = لون (كل سطرٍ
--                                 سابق لهذه الهجرة)، فتغييرُ نوع المنتج لاحقاً
--                                 لا يُعيد تسمية طلبٍ قديم.
--
-- التراجع: `ALTER TABLE order_items DROP COLUMN variant_kind;
--           ALTER TABLE products DROP COLUMN variant_kind;` — لا يمسّ خياراً
-- ولا مخزوناً ولا طلباً؛ يُفقد النوع وحده (فيعود كل شيء «لوناً»).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS variant_kind TEXT NOT NULL DEFAULT 'color';

ALTER TABLE products
  ADD CONSTRAINT products_variant_kind_known
  CHECK (variant_kind IN ('color', 'design', 'size'));

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS variant_kind TEXT;

ALTER TABLE order_items
  ADD CONSTRAINT order_items_variant_kind_known
  CHECK (variant_kind IS NULL OR variant_kind IN ('color', 'design', 'size'));
