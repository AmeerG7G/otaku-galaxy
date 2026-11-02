-- 026_birthday_calendar.sql
-- تقويم أعياد الميلاد: «اليوم» و«القادم خلال N يوماً» كسؤالين تجيب عنهما
-- قاعدة البيانات، بدل جلب كل الزبائن وحساب التواريخ في التطبيق.
--
-- الميلاد مخزَّن يوماً وشهراً بلا سنة (هجرة ٠١٣)، فحساب «العيد القادم»
-- يحتاج بناء تاريخ في سنة معيّنة — وهنا فخّان:
--   • ٢٩ شباط: `make_date(2025, 2, 29)` يرمي استثناءً في سنة غير كبيسة.
--   • التفاف السنة: عيدٌ في كانون الثاني «قادم» في كانون الأول.
-- الدالتان أدناه تعالجان الاثنين مرة واحدة، فلا يعيد كل استعلام حلّهما.

/**
 * تاريخ ميلاد صالح دائماً في السنة المطلوبة.
 * ٢٩ شباط في سنة غير كبيسة يُحتفل به في ٢٨ — لا يُسقط صاحبه من القوائم.
 */
CREATE OR REPLACE FUNCTION safe_birthday_date(y INT, m INT, d INT)
RETURNS DATE AS $$
BEGIN
  RETURN make_date(y, m, d);
EXCEPTION WHEN others THEN
  RETURN make_date(y, m, d - 1);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

/**
 * أقرب عيد ميلاد قادم (أو اليوم) نسبةً إلى `today`.
 * `today` يمرَّره المستدعي محسوباً بمنطقة المتجر الزمنية، لا `CURRENT_DATE`.
 */
CREATE OR REPLACE FUNCTION next_birthday(d INT, m INT, today DATE)
RETURNS DATE AS $$
DECLARE
  occurrence DATE;
BEGIN
  IF d IS NULL OR m IS NULL THEN RETURN NULL; END IF;
  occurrence := safe_birthday_date(EXTRACT(YEAR FROM today)::INT, m, d);
  IF occurrence < today THEN
    occurrence := safe_birthday_date(EXTRACT(YEAR FROM today)::INT + 1, m, d);
  END IF;
  RETURN occurrence;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- الاستعلامات الثلاثة (اليوم/قادم/غير مسجّل) تمرّ كلها على هذين العمودين.
CREATE INDEX IF NOT EXISTS idx_users_birthday
  ON users (birth_month, birth_day)
  WHERE role = 'customer' AND birth_day IS NOT NULL;
