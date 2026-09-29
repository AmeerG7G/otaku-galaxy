-- 069_simplify_app_update.sql
-- إجبار التحديث بثلاثة إعدادات: مفعَّل؟ الحدّ الأدنى، رابط التحديث.
--
-- ═══════════════ القرار (2026-09-29، STEP 64) ═══════════════
--
-- المالك وجد إعداد التحديث معقّداً: ستّة حقول (حدٌّ أدنى، أحدث نسخة، رابطا
-- متجرين، رسالتان بلغتين). المطلوب: تفعيلٌ/إيقاف، وحدٌّ أدنى، ورابطٌ واحد.
-- رسالة التحديث صارت نصّ التطبيق الافتراضي بلغته (يُلغي حقلي STEP 60.5).
--
-- ═══════════════ بيانات فقط ═══════════════
--
-- `store_settings` جدول مفتاح/قيمة — لا تغيير في البنية. الانتقال يحفظ
-- السلوك القائم حرفياً:
--   app_force_update_enabled = 'true' إن كان حدٌّ أدنى مضبوطاً، وإلا 'false'.
--                               (الحجب اليوم = «حدٌّ أدنى غير فارغ»؛ فمن كان
--                               محجوباً قبل الهجرة يبقى محجوباً بعدها.)
--   app_update_url            = رابط أندرويد إن وُجد، وإلا رابط آبل.
-- ثم تُحذف المفاتيح التي لم يعد يقرؤها شيء. الخادم يُبقي الحقول القديمة في
-- ردّ `/catalog/app-version` مشتقّةً من الجديدة، فالنسخ المثبَّتة (1.0.0)
-- تواصل العمل بلا تحديث.

INSERT INTO store_settings (key, value)
SELECT 'app_force_update_enabled',
       CASE WHEN btrim(COALESCE(
              (SELECT value FROM store_settings WHERE key = 'app_min_supported_version'), '')) <> ''
            THEN 'true' ELSE 'false' END
ON CONFLICT (key) DO NOTHING;

INSERT INTO store_settings (key, value)
SELECT 'app_update_url',
       COALESCE(
         NULLIF(btrim((SELECT value FROM store_settings WHERE key = 'app_android_store_url')), ''),
         NULLIF(btrim((SELECT value FROM store_settings WHERE key = 'app_ios_store_url')), ''),
         '')
ON CONFLICT (key) DO NOTHING;

DELETE FROM store_settings
 WHERE key IN (
   'app_latest_version',
   'app_android_store_url',
   'app_ios_store_url',
   'app_update_message',
   'app_update_message_ckb'
 );
