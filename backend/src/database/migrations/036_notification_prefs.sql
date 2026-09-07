-- 036_notification_prefs.sql
-- تفضيلات إشعارات العميل (المفاتيح الستة في شاشة الإعدادات) تُحفظ خادمياً.
-- كانت محلية على الجهاز فقط — لا تنجو من إعادة التثبيت ولا تعرفها بقية
-- الأجهزة. الافتراضي «مفعّل» لكل مفتاح عدا «العروض» الذي يبقى قبالاً عمداً:
-- الإشعارات الترويجية لا تُرسل إلا بطلب صريح.

CREATE TABLE user_notification_prefs (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        TEXT NOT NULL CHECK (
               key IN ('orders','reviews','stock','offers','points','birthday')
             ),
  enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE TRIGGER trg_user_notification_prefs_updated_at
  BEFORE UPDATE ON user_notification_prefs FOR EACH ROW EXECUTE FUNCTION set_updated_at();