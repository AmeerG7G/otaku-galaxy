-- 079_behaviour_tracking.sql
-- تتبّعٌ تجميعي فقط — مطفأ افتراضياً (`ANALYTICS_TRACKING_ENABLED=false`).
--
-- ═══════════════ القرار (2026-10-03، STEP 67، D3) ═══════════════
--
-- سبع إشارات: مشاهدة منتج، إضافة إلى السلة، بحث، مشاركة، فتح إشعار، زبون نشط
-- يومياً، تسجيل دخول. **لا سجلّ أحداث خام.** كلها عدّادات يومية بلا معرّف
-- مستخدم، إلا `user_daily_activity` (معرّف + تاريخ + عدد الدخول) لأن عدّ
-- النشطين المميَّزين في الشهر يحتاجه — ويُطهَّر بعد ٤٠٠ يوم، بعد أن تُجمَّد
-- أرقامه في `analytics_daily_activity` و`analytics_monthly_customers`.
--
-- فتح الإشعار يُكتب على صفّ الإشعار نفسه (`notifications.opened_at`، ٠٧٤).
--
-- البحث نصٌّ حر، فيُرشَّح قبل الحفظ: مطويّاً (`search_fold`، ٠٦٤)، ٢–٦٠ محرفاً،
-- وتُسقط أي عبارةٍ فيها ستة أرقام متتالية أو بريد. لا مستخدم ولا جهاز معه.
-- يبقى يومياً ٤٠٠ يوم، وتُجمَّد أعلى العبارات (مرتان فأكثر) شهرياً.
--
-- `analytics_tracking_epochs`: متى شُغّل التتبّع ومتى أُطفئ في هذه البيئة —
-- الأرقام لا تُعرض ولا تُملأ بأصفارٍ قبل بداية القياس. حقبةٌ مفتوحة واحدة فقط.

CREATE TABLE product_daily_counters (
  stat_date       DATE NOT NULL,
  -- بلا FK كبند الطلب: التاريخ يبقى ولو حُذف المنتج.
  product_id      UUID NOT NULL,
  views           INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
  cart_adds       INTEGER NOT NULL DEFAULT 0 CHECK (cart_adds >= 0),
  share_opens     INTEGER NOT NULL DEFAULT 0 CHECK (share_opens >= 0),
  share_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (share_confirmed BETWEEN 0 AND share_opens),
  PRIMARY KEY (stat_date, product_id)
);

CREATE TABLE search_daily_terms (
  stat_date   DATE NOT NULL,
  term        TEXT NOT NULL CHECK (char_length(term) BETWEEN 2 AND 60),
  searches    INTEGER NOT NULL DEFAULT 0 CHECK (searches >= 0),
  zero_result INTEGER NOT NULL DEFAULT 0 CHECK (zero_result BETWEEN 0 AND searches),
  PRIMARY KEY (stat_date, term)
);

CREATE TABLE user_daily_activity (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  logins        INTEGER NOT NULL DEFAULT 0 CHECK (logins >= 0),
  PRIMARY KEY (user_id, activity_date)
);

CREATE INDEX idx_user_daily_activity_date ON user_daily_activity (activity_date);

CREATE TABLE analytics_tracking_epochs (
  id          BIGSERIAL PRIMARY KEY,
  enabled_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  disabled_at TIMESTAMPTZ,
  CONSTRAINT analytics_tracking_epochs_order CHECK (disabled_at IS NULL OR disabled_at >= enabled_at)
);

CREATE UNIQUE INDEX uq_analytics_tracking_epochs_open
  ON analytics_tracking_epochs ((TRUE)) WHERE disabled_at IS NULL;
