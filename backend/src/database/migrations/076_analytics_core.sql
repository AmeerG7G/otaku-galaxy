-- 076_analytics_core.sql
-- التحليلات التاريخية: نطاقٌ واحد للطلبات، وملخّصات يومية/شهرية دائمة، وأشهرٌ مُغلقة.
--
-- ═══════════════ القرار (2026-10-03، STEP 67) ═══════════════
--
-- مصدر الحقيقة يبقى الجداول التشغيلية (الطلبات، بنودها، سجلّ الحالات،
-- المستخدمون). الملخّصات تُشتقّ منها بمهمّة `analyticsJob` بتوقيت المتجر
-- (Asia/Baghdad)، ويمكن إعادة بنائها. المقاييس مؤرَّخة بالحدث: المبيعات بيوم
-- `delivered_at` (COMPLETED نهائية وتُضبط مرة واحدة)، والطلبات بيوم الإنشاء،
-- والرفض بيوم صفّ REJECTED في السجلّ.
--
-- ═══════════════ النطاق التجاري (D2) — تعريفٌ واحد ═══════════════
--
-- `analytics_order_scope` هو المكان الوحيد الذي يقرّر أيّ طلبٍ يدخل التحليلات:
-- لقطة الدور ساعة الطلب زبون، وصاحب الحساب غير معلَّم داخلياً. كل استعلام
-- تحليلات يقرأ `analytics_business_orders`/`analytics_business_customers`،
-- واختبارٌ يفحص المصدر يسقط إن قرأ أحدها `orders`/`users` مباشرةً.
--
-- ═══════════════ الأشهر المُغلقة ═══════════════
--
-- يُغلق الشهر بعد مهلة سبعة أيام من نهايته. بعدها يرفض زنادٌ أي إدراج/تعديل/حذف
-- لصفوفه — إلا داخل جلسة إعادة بناءٍ مُدقَّقة تضبط `analytics.rebuild = on`
-- (سكربت `analyticsRebuild.ts` وحده، ويسجّل قبل/بعد في `analytics_rebuild_log`).
-- لا حذف تلقائي لأي ملخّص، ولا يُعاد فتح شهرٍ مُغلق.
--
-- ═══════════════ الجنس ═══════════════
--
-- أعمدة الجنس اثنان فقط: ذكور وإناث. لا عمود ثالث بأي اسم.

-- ═══ النطاق ═══

CREATE VIEW analytics_order_scope AS
SELECT o.id AS order_id,
       (o.placed_by_role = 'customer' AND NOT u.is_internal_account) AS in_scope
  FROM orders o
  JOIN users u ON u.id = o.user_id;

CREATE VIEW analytics_business_orders AS
SELECT o.id, o.user_id, o.governorate_id, o.status, o.products_total, o.discount,
       o.loyalty_discount, o.delivery_fee, o.delivery_discount, o.created_at, o.delivered_at
  FROM orders o
  JOIN analytics_order_scope s ON s.order_id = o.id
 WHERE s.in_scope;

CREATE VIEW analytics_business_customers AS
SELECT u.id, u.gender, u.created_at, u.phone_verified_at, u.is_active
  FROM users u
 WHERE u.role = 'customer'
   AND u.phone_verified_at IS NOT NULL
   AND NOT u.is_internal_account;

-- ═══ الفترات ═══

CREATE TABLE analytics_periods (
  month               DATE PRIMARY KEY CHECK (month = date_trunc('month', month::TIMESTAMP)::DATE),
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  dirty               BOOLEAN NOT NULL DEFAULT TRUE,
  computed_through    DATE,
  computed_at         TIMESTAMPTZ,
  closed_at           TIMESTAMPTZ,
  definitions_version INTEGER NOT NULL DEFAULT 1 CHECK (definitions_version > 0),
  reconciliation      JSONB NOT NULL DEFAULT '{}'::JSONB,
  CONSTRAINT analytics_periods_closed_pair CHECK ((status = 'closed') = (closed_at IS NOT NULL))
);

CREATE FUNCTION analytics_guard_period() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'analytics periods are permanent';
  END IF;
  IF OLD.status = 'closed' AND NEW.status = 'open' THEN
    RAISE EXCEPTION 'analytics month % cannot be reopened', to_char(OLD.month, 'YYYY-MM');
  END IF;
  IF OLD.status = 'closed' AND COALESCE(current_setting('analytics.rebuild', TRUE), '') <> 'on' THEN
    RAISE EXCEPTION 'analytics month % is closed', to_char(OLD.month, 'YYYY-MM');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_analytics_periods_guard
  BEFORE UPDATE OR DELETE ON analytics_periods
  FOR EACH ROW EXECUTE FUNCTION analytics_guard_period();

-- حارس الصفوف: عمود التاريخ يُمرَّر اسماً (`stat_date` أو `month`).
CREATE FUNCTION analytics_guard_closed() RETURNS TRIGGER AS $$
DECLARE
  col TEXT := TG_ARGV[0];
  d   DATE;
BEGIN
  IF COALESCE(current_setting('analytics.rebuild', TRUE), '') = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    d := (to_jsonb(OLD) ->> col)::DATE;
    IF EXISTS (SELECT 1 FROM analytics_periods p
                WHERE p.month = date_trunc('month', d::TIMESTAMP)::DATE AND p.status = 'closed') THEN
      RAISE EXCEPTION 'analytics month % is closed (%)', to_char(d, 'YYYY-MM'), TG_TABLE_NAME;
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    d := (to_jsonb(NEW) ->> col)::DATE;
    IF EXISTS (SELECT 1 FROM analytics_periods p
                WHERE p.month = date_trunc('month', d::TIMESTAMP)::DATE AND p.status = 'closed') THEN
      RAISE EXCEPTION 'analytics month % is closed (%)', to_char(d, 'YYYY-MM'), TG_TABLE_NAME;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ═══ الملخّصات اليومية (جمعية) ═══

CREATE TABLE analytics_daily_sales (
  stat_date                      DATE PRIMARY KEY,
  orders_placed                  INTEGER NOT NULL DEFAULT 0 CHECK (orders_placed >= 0),
  orders_completed               INTEGER NOT NULL DEFAULT 0 CHECK (orders_completed >= 0),
  orders_rejected                INTEGER NOT NULL DEFAULT 0 CHECK (orders_rejected >= 0),
  orders_rejected_after_dispatch INTEGER NOT NULL DEFAULT 0
                                   CHECK (orders_rejected_after_dispatch BETWEEN 0 AND orders_rejected),
  gross_sales                    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (gross_sales >= 0),
  product_discounts              NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (product_discounts >= 0),
  birthday_discounts             NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (birthday_discounts >= 0),
  loyalty_discounts              NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (loyalty_discounts >= 0),
  sales_revenue                  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (sales_revenue >= 0),
  delivery_promo_given           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (delivery_promo_given >= 0),
  units_sold                     INTEGER NOT NULL DEFAULT 0 CHECK (units_sold >= 0),
  max_order_value                NUMERIC(12,2),
  item_lines                     INTEGER NOT NULL DEFAULT 0 CHECK (item_lines >= 0),
  item_lines_with_cost           INTEGER NOT NULL DEFAULT 0 CHECK (item_lines_with_cost BETWEEN 0 AND item_lines),
  cogs                           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cogs >= 0),
  item_lines_with_list_price     INTEGER NOT NULL DEFAULT 0
                                   CHECK (item_lines_with_list_price BETWEEN 0 AND item_lines),
  promo_markdown                 NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (promo_markdown >= 0),
  birthday_usage_amount          NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (birthday_usage_amount >= 0),
  excluded_orders_completed      INTEGER NOT NULL DEFAULT 0 CHECK (excluded_orders_completed >= 0),
  excluded_sales_value           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (excluded_sales_value >= 0),
  computed_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- الإيراد = الإجمالي − خصومات المنتجات، والخصومات = ميلاد + مزيّة. لا توصيل.
  CONSTRAINT analytics_daily_sales_revenue_identity CHECK (sales_revenue = gross_sales - product_discounts),
  CONSTRAINT analytics_daily_sales_discount_identity
    CHECK (product_discounts = birthday_discounts + loyalty_discounts)
);

CREATE TABLE analytics_daily_product (
  stat_date            DATE NOT NULL,
  product_id           UUID NOT NULL,
  product_name         TEXT NOT NULL,
  category_id          UUID,
  units                INTEGER NOT NULL DEFAULT 0 CHECK (units >= 0),
  gross_value          NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (gross_value >= 0),
  orders               INTEGER NOT NULL DEFAULT 0 CHECK (orders >= 0),
  item_lines           INTEGER NOT NULL DEFAULT 0 CHECK (item_lines >= 0),
  item_lines_with_cost INTEGER NOT NULL DEFAULT 0 CHECK (item_lines_with_cost BETWEEN 0 AND item_lines),
  cogs                 NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cogs >= 0),
  computed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (stat_date, product_id)
);

CREATE INDEX idx_analytics_daily_product_product ON analytics_daily_product (product_id, stat_date);

-- القسم وقت البيع (لقطة ٠٧٧) أو القسم الحالي للبنود الأقدم — الأساس معدودٌ صراحةً.
CREATE TABLE analytics_daily_category (
  stat_date           DATE NOT NULL,
  category_id         UUID NOT NULL,
  units               INTEGER NOT NULL DEFAULT 0 CHECK (units >= 0),
  gross_value         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (gross_value >= 0),
  orders              INTEGER NOT NULL DEFAULT 0 CHECK (orders >= 0),
  lines_basis_snapshot INTEGER NOT NULL DEFAULT 0 CHECK (lines_basis_snapshot >= 0),
  lines_basis_current  INTEGER NOT NULL DEFAULT 0 CHECK (lines_basis_current >= 0),
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (stat_date, category_id)
);

CREATE TABLE analytics_daily_governorate (
  stat_date        DATE NOT NULL,
  governorate_id   UUID NOT NULL,
  orders_placed    INTEGER NOT NULL DEFAULT 0 CHECK (orders_placed >= 0),
  orders_completed INTEGER NOT NULL DEFAULT 0 CHECK (orders_completed >= 0),
  orders_rejected  INTEGER NOT NULL DEFAULT 0 CHECK (orders_rejected >= 0),
  gross_sales      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (gross_sales >= 0),
  sales_revenue    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (sales_revenue >= 0),
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (stat_date, governorate_id)
);

-- النشاط اليومي (من أيام النشاط ٠٧٩) — يبقى بعد تطهير الأيام الخام.
CREATE TABLE analytics_daily_activity (
  stat_date        DATE PRIMARY KEY,
  active_customers INTEGER NOT NULL DEFAULT 0 CHECK (active_customers >= 0),
  logins           INTEGER NOT NULL DEFAULT 0 CHECK (logins >= 0),
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══ الملخّصات الشهرية (أعدادٌ مميَّزة لا تُجمع يوماً بيوم) ═══

CREATE TABLE analytics_monthly_customers (
  month                DATE PRIMARY KEY,
  customers_end        INTEGER NOT NULL DEFAULT 0 CHECK (customers_end >= 0),
  customers_male_end   INTEGER NOT NULL DEFAULT 0 CHECK (customers_male_end >= 0),
  customers_female_end INTEGER NOT NULL DEFAULT 0 CHECK (customers_female_end >= 0),
  new_customers        INTEGER NOT NULL DEFAULT 0 CHECK (new_customers >= 0),
  new_customers_male   INTEGER NOT NULL DEFAULT 0 CHECK (new_customers_male >= 0),
  new_customers_female INTEGER NOT NULL DEFAULT 0 CHECK (new_customers_female >= 0),
  buyers               INTEGER NOT NULL DEFAULT 0 CHECK (buyers >= 0),
  buyers_male          INTEGER NOT NULL DEFAULT 0 CHECK (buyers_male >= 0),
  buyers_female        INTEGER NOT NULL DEFAULT 0 CHECK (buyers_female >= 0),
  new_buyers           INTEGER NOT NULL DEFAULT 0 CHECK (new_buyers >= 0),
  returning_buyers     INTEGER NOT NULL DEFAULT 0 CHECK (returning_buyers >= 0),
  repeat_buyers        INTEGER NOT NULL DEFAULT 0 CHECK (repeat_buyers >= 0),
  -- NULL = النشاط لم يُقَس في هذا الشهر (خارج حقبة التتبّع) — لا صفر مختلَق.
  active_customers     INTEGER CHECK (active_customers IS NULL OR active_customers >= 0),
  computed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT analytics_monthly_customers_gender_within
    CHECK (customers_male_end + customers_female_end <= customers_end
           AND new_customers_male + new_customers_female <= new_customers
           AND buyers_male + buyers_female <= buyers),
  CONSTRAINT analytics_monthly_customers_buyers_split CHECK (new_buyers + returning_buyers = buyers)
);

CREATE TABLE analytics_monthly_orders (
  month             DATE PRIMARY KEY,
  processing_at_end INTEGER NOT NULL DEFAULT 0 CHECK (processing_at_end >= 0),
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE analytics_monthly_governorate (
  month          DATE NOT NULL,
  governorate_id UUID NOT NULL,
  buyers         INTEGER NOT NULL DEFAULT 0 CHECK (buyers >= 0),
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (month, governorate_id)
);

CREATE TABLE analytics_monthly_search_terms (
  month       DATE NOT NULL,
  term        TEXT NOT NULL CHECK (char_length(term) BETWEEN 2 AND 60),
  searches    INTEGER NOT NULL CHECK (searches >= 2),
  zero_result INTEGER NOT NULL DEFAULT 0 CHECK (zero_result BETWEEN 0 AND searches),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (month, term)
);

-- ═══ سجلّ إعادة البناء (إلحاقٌ فقط) ═══

CREATE TABLE analytics_rebuild_log (
  id             BIGSERIAL PRIMARY KEY,
  scope_from     DATE NOT NULL,
  scope_to       DATE NOT NULL CHECK (scope_to >= scope_from),
  include_closed BOOLEAN NOT NULL,
  reason         TEXT NOT NULL CHECK (btrim(reason) <> ''),
  actor          TEXT NOT NULL CHECK (btrim(actor) <> ''),
  before         JSONB NOT NULL,
  after          JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE FUNCTION forbid_change_analytics_rebuild_log() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'analytics_rebuild_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_analytics_rebuild_log_append_only
  BEFORE UPDATE OR DELETE ON analytics_rebuild_log
  FOR EACH ROW EXECUTE FUNCTION forbid_change_analytics_rebuild_log();

-- ═══ حرّاس الأشهر المُغلقة ═══

CREATE TRIGGER trg_analytics_daily_sales_closed BEFORE INSERT OR UPDATE OR DELETE ON analytics_daily_sales
  FOR EACH ROW EXECUTE FUNCTION analytics_guard_closed('stat_date');
CREATE TRIGGER trg_analytics_daily_product_closed BEFORE INSERT OR UPDATE OR DELETE ON analytics_daily_product
  FOR EACH ROW EXECUTE FUNCTION analytics_guard_closed('stat_date');
CREATE TRIGGER trg_analytics_daily_category_closed BEFORE INSERT OR UPDATE OR DELETE ON analytics_daily_category
  FOR EACH ROW EXECUTE FUNCTION analytics_guard_closed('stat_date');
CREATE TRIGGER trg_analytics_daily_governorate_closed BEFORE INSERT OR UPDATE OR DELETE ON analytics_daily_governorate
  FOR EACH ROW EXECUTE FUNCTION analytics_guard_closed('stat_date');
CREATE TRIGGER trg_analytics_daily_activity_closed BEFORE INSERT OR UPDATE OR DELETE ON analytics_daily_activity
  FOR EACH ROW EXECUTE FUNCTION analytics_guard_closed('stat_date');
CREATE TRIGGER trg_notification_daily_engagement_closed BEFORE INSERT OR UPDATE OR DELETE ON notification_daily_engagement
  FOR EACH ROW EXECUTE FUNCTION analytics_guard_closed('stat_date');
CREATE TRIGGER trg_analytics_monthly_customers_closed BEFORE INSERT OR UPDATE OR DELETE ON analytics_monthly_customers
  FOR EACH ROW EXECUTE FUNCTION analytics_guard_closed('month');
CREATE TRIGGER trg_analytics_monthly_orders_closed BEFORE INSERT OR UPDATE OR DELETE ON analytics_monthly_orders
  FOR EACH ROW EXECUTE FUNCTION analytics_guard_closed('month');
CREATE TRIGGER trg_analytics_monthly_governorate_closed BEFORE INSERT OR UPDATE OR DELETE ON analytics_monthly_governorate
  FOR EACH ROW EXECUTE FUNCTION analytics_guard_closed('month');
CREATE TRIGGER trg_analytics_monthly_search_terms_closed BEFORE INSERT OR UPDATE OR DELETE ON analytics_monthly_search_terms
  FOR EACH ROW EXECUTE FUNCTION analytics_guard_closed('month');

-- ═══ فهارس المصادر ═══
-- `idx_orders_created_at` موجود منذ ٠٥٦.

CREATE INDEX idx_orders_delivered_at ON orders (delivered_at) WHERE status = 'COMPLETED';
CREATE INDEX idx_order_status_history_status_created ON order_status_history (status, created_at);
CREATE INDEX idx_users_customer_verified ON users (phone_verified_at) WHERE role = 'customer';
