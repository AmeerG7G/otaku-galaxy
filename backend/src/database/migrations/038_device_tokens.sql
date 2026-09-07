-- رموز أجهزة الإشعارات الفورية (push).
--
-- الإشعار داخل التطبيق (`notifications`) يبقى كما هو ولا يُمَسّ: هو السجلّ
-- الذي يقرؤه الزبون في شاشة الإشعارات. هذا الجدول يضيف الطبقة الأخرى —
-- إيصال التنبيه إلى نظام الهاتف حتى والتطبيق مغلق.
--
-- التصميم:
--   * الرمز نفسه هو المفتاح الفريد لا (المستخدم، الجهاز): مزوّدو الإشعارات
--     يعيدون تدوير الرموز بين التطبيقات والأجهزة. لو أُعيد رمزٌ لمستخدم آخر
--     وجب أن ينتقل إليه لا أن يُنشئ صفاً ثانياً يرسل لصاحبه القديم — وهو
--     تسريبُ إشعارات إلى الجهاز الخطأ.
--   * `ON DELETE CASCADE`: حذف الحساب يحذف رموزه، فلا يبقى جهازٌ يستقبل
--     إشعارات حسابٍ لم يعد موجوداً.
--   * `is_active` بدل الحذف الفوري: الرمز الذي يرفضه المزوّد يُعطَّل ويبقى
--     أثره، فنعرف لماذا توقّف جهازٌ عن الاستقبال بدل أن يختفي بلا سبب.
--   * أكثر من جهاز للمستخدم الواحد مدعوم بطبيعة الجدول (لا قيد فريد على
--     `user_id`).

CREATE TABLE device_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- رمز المزوّد. فريدٌ عالمياً: انظر التعليق أعلاه.
  token       TEXT NOT NULL UNIQUE CHECK (length(token) BETWEEN 8 AND 4096),

  platform    TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web')),

  is_active   BOOLEAN NOT NULL DEFAULT TRUE,

  -- آخر مرة أكّد فيها التطبيق أن هذا الرمز ما يزال رمزه. يُحدَّث عند كل
  -- تسجيل، فيمكن تنظيف الرموز الميتة لاحقاً بالعمر.
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- الاستعلام الوحيد الساخن: «رموز هؤلاء المستخدمين النشطة» عند كل إرسال.
CREATE INDEX idx_device_tokens_user_active
  ON device_tokens (user_id) WHERE is_active;

CREATE TRIGGER trg_device_tokens_updated_at
  BEFORE UPDATE ON device_tokens FOR EACH ROW EXECUTE FUNCTION set_updated_at();
