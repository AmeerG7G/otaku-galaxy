-- 028_visual_slots.sql
-- إدارة رسوم الشخصيات من لوحة التحكم بدل إصدار تطبيق جديد.
--
-- الرسوم التزيينية اليوم أصول مضمَّنة في حزمة التطبيق: تغيير شخصية واحدة
-- يستلزم بناءً جديداً ونشراً على المتجرين وانتظار تحديث كل زبون — أي أن
-- قراراً تسويقياً موسمياً محكوم بدورة نشر تطبيق.
--
-- النموذج: «فتحة» (slot) دورٌ بصري في الواجهة، ولها قائمة صور مرتَّبة.
-- الفتحة تُعرَّف بدورها لا بموضعها: «الحالة الفارغة للسلة» فتحة واحدة،
-- لا فتحة لكل مكان تظهر فيه. التطبيق يطلب الدور فيصله الرابط المختار.
--
-- [CRITICAL] الفتحة الفارغة ليست خطأً بل هي الحالة الطبيعية بعد الترقية.
-- لا صفوف تُزرع هنا عمداً: ما دامت الفتحة بلا صور، يعرض التطبيق الأصل
-- المضمَّن كما يفعل اليوم بالضبط، فترقية الخادم لا تغيّر بكسلاً واحداً
-- حتى يقرّر المسؤول ذلك بنفسه.

-- غرض جديد في سجل الوسائط. إضافة لا استبدال — نفس أسلوب الهجرة ٠٢٣.
ALTER TABLE media_files DROP CONSTRAINT IF EXISTS media_files_purpose_check;
ALTER TABLE media_files
  ADD CONSTRAINT media_files_purpose_check
    CHECK (purpose IN (
      'product', 'review', 'avatar', 'banner', 'franchise', 'category', 'slot'
    ));

/**
 * نمط التدوير.
 *
 * `fixed`: الصورة النشطة الأولى دائماً.
 * `daily`: تتبدّل الصورة يومياً باختيار حتمي مشتقّ من التاريخ.
 *
 * `sequential` و`random` مؤجَّلان عمداً: كلاهما يحتاج عدّاداً لكل جهاز،
 * وهو حالةٌ تُخزَّن وتُزامَن وتفسد — مقابل فائدة لم تُطلب بعد.
 */
CREATE TABLE visual_slots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- مفتاح ثابت يعرفه كود التطبيق. لا يُترجم ولا يُعاد تسميته.
  slot_key      TEXT NOT NULL UNIQUE
                CHECK (slot_key ~ '^[a-z][a-z0-9_]{2,48}$'),
  -- وصف للمسؤول: أين يظهر هذا الدور فعلاً في التطبيق.
  label         TEXT NOT NULL DEFAULT '',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  rotation_mode TEXT NOT NULL DEFAULT 'fixed'
                CHECK (rotation_mode IN ('fixed', 'daily')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_visual_slots_updated_at
  BEFORE UPDATE ON visual_slots FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE visual_slot_images (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id    UUID NOT NULL REFERENCES visual_slots(id) ON DELETE CASCADE,
  -- مرجع نسبي (`/uploads/...`) كبقية الوسائط — يحوّله كل عميل مقابل أصله.
  -- الحذف المتتالي هنا مقصود: الصورة لا تعني شيئاً خارج فتحتها.
  url        TEXT NOT NULL CHECK (char_length(btrim(url)) > 0),
  -- ربط اختياري بسجل الوسائط: يبقى الرابط صالحاً حتى لو رُفعت الصورة
  -- خارج المنظومة (رابط خارجي)، ويُمكّن التنظيف حين تكون مرفوعة عندنا.
  media_id   UUID REFERENCES media_files(id) ON DELETE SET NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- نفس الصورة مرتين في الفتحة الواحدة تُفسد التدوير اليومي بلا فائدة.
  UNIQUE (slot_id, url)
);

-- ترتيب مستقر: الترتيب ثم الإنشاء. بدون الفاصل الثاني يصير ترتيب صورتين
-- بنفس `sort_order` غير محدَّد، فيتبدّل الاختيار اليومي بلا سبب.
CREATE INDEX idx_visual_slot_images_slot
  ON visual_slot_images (slot_id, sort_order, created_at);

CREATE TRIGGER trg_visual_slot_images_updated_at
  BEFORE UPDATE ON visual_slot_images FOR EACH ROW EXECUTE FUNCTION set_updated_at();
