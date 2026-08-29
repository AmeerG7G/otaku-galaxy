-- 017_store_settings.sql
-- إعدادات المتجر التي يديرها المسؤول (روابط التواصل حالياً).
-- مخزَّنة كأزواج مفتاح/قيمة حتى لا تحتاج كل إضافة هجرة جديدة.

CREATE TABLE store_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_store_settings_updated_at
  BEFORE UPDATE ON store_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- قيم فارغة افتراضياً: التطبيق يُبقي سلوكه الآمن الحالي حتى تُضبط فعلياً.
INSERT INTO store_settings (key, value) VALUES
  ('social_tiktok', ''),
  ('social_instagram', ''),
  ('social_whatsapp', '')
ON CONFLICT (key) DO NOTHING;
