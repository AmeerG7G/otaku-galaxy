-- 075_notification_daily_stats.sql
-- الإحصاء اليومي الدائم للإشعارات — يُكتب قبل أن يُسمح بحذف صفوف الصندوق.
--
-- ═══════════════ القرار (2026-10-03، STEP 67) ═══════════════
--
-- `push_outbox` ليس أرشيفاً: يُطهَّر محسومُه بعد ٣٠ يوماً. كان ذلك يمحو تاريخ
-- الدفع كله. الآن يُلخَّص كل يومٍ (بتوقيت المتجر) مرةً واحدة حين لا يبقى من
-- صفوفه معلَّق، في `notification_daily_stats`، ثم — وفقط ثم — يجوز حذف صفوفه.
--
-- صفّ اليوم الملخَّص **لا يتغيّر ولا يُحذف** (زناد). التلخيص يُدرج مرة واحدة
-- (`ON CONFLICT DO NOTHING`) ويعلّم الصفوف في المعاملة نفسها.
--
-- التفاعل (`notification_daily_engagement`) مؤرَّخٌ بيوم حدوثه: قراءةٌ داخل
-- التطبيق يوم `read_at`، وفتحٌ بالنقر يوم `opened_at`. لذلك لا يحتاج يومٌ
-- ملخَّص إعادةَ كتابة حين يقرأ زبونٌ إشعاراً قديماً لاحقاً: القراءة تُعدّ في
-- يومها هي. أيام الشهر المفتوح تُعاد حسابها، والشهر المُغلق يُجمَّد بحارس ٠٧٦.
--
-- `notif_type`: نوع إشعار الزبون (`data.type`) أو مفتاح حدث المسؤول (`event_key`).

CREATE TABLE notification_daily_stats (
  stat_date              DATE NOT NULL,
  audience               TEXT NOT NULL CHECK (audience IN ('customer', 'admin')),
  notif_type             TEXT NOT NULL,
  campaign_id            UUID REFERENCES notification_campaigns(id) ON DELETE RESTRICT,
  created                INTEGER NOT NULL DEFAULT 0 CHECK (created >= 0),
  accepted               INTEGER NOT NULL DEFAULT 0 CHECK (accepted >= 0),
  failed                 INTEGER NOT NULL DEFAULT 0 CHECK (failed >= 0),
  skipped_not_configured INTEGER NOT NULL DEFAULT 0 CHECK (skipped_not_configured >= 0),
  skipped_pref           INTEGER NOT NULL DEFAULT 0 CHECK (skipped_pref >= 0),
  skipped_no_devices     INTEGER NOT NULL DEFAULT 0 CHECK (skipped_no_devices >= 0),
  devices_accepted       INTEGER NOT NULL DEFAULT 0 CHECK (devices_accepted >= 0),
  devices_invalid        INTEGER NOT NULL DEFAULT 0 CHECK (devices_invalid >= 0),
  devices_transient      INTEGER NOT NULL DEFAULT 0 CHECK (devices_transient >= 0),
  rolled_up_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notification_daily_stats_outcomes_add_up
    CHECK (created = accepted + failed + skipped_not_configured + skipped_pref + skipped_no_devices)
);

CREATE UNIQUE INDEX uq_notification_daily_stats
  ON notification_daily_stats (stat_date, audience, notif_type,
                               COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::UUID));
CREATE INDEX idx_notification_daily_stats_campaign
  ON notification_daily_stats (campaign_id) WHERE campaign_id IS NOT NULL;

CREATE FUNCTION forbid_change_notification_daily_stats() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'notification_daily_stats rows are permanent and immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notification_daily_stats_immutable
  BEFORE UPDATE OR DELETE ON notification_daily_stats
  FOR EACH ROW EXECUTE FUNCTION forbid_change_notification_daily_stats();

CREATE TABLE notification_daily_engagement (
  stat_date        DATE NOT NULL,
  notif_type       TEXT NOT NULL,
  campaign_id      UUID REFERENCES notification_campaigns(id) ON DELETE RESTRICT,
  read_in_app      INTEGER NOT NULL DEFAULT 0 CHECK (read_in_app >= 0),
  opened_from_push INTEGER NOT NULL DEFAULT 0 CHECK (opened_from_push >= 0),
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_notification_daily_engagement
  ON notification_daily_engagement (stat_date, notif_type,
                                    COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::UUID));
