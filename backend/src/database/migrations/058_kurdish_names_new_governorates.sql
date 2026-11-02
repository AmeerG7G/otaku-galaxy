-- 058_kurdish_names_new_governorates.sql
-- إضافة الأسماء الكردية للمحافظات التي أُضيفت بعد تطبيق الهجرة 047.
-- الهجرة 047 طُبّقت في 2026-09-12 وكانت تضم 10 محافظات فقط (قائمة البذرة الأصلية).
-- المحافظات التسع التالية أُضيفت لاحقاً عبر تحديث `scripts/seed.ts` وتحتاج أسماء كردية.

-- ═══════════════ ١ · المحافظات المضافة حديثاً ═══════════════

UPDATE governorates SET name_ckb = 'سلێمانی' WHERE name = 'السليمانية' AND name_ckb IS NULL;
UPDATE governorates SET name_ckb = 'دهۆک' WHERE name = 'دهوك' AND name_ckb IS NULL;
UPDATE governorates SET name_ckb = 'کەرکووک' WHERE name = 'كركوك' AND name_ckb IS NULL;
UPDATE governorates SET name_ckb = 'بابل' WHERE name = 'بابل' AND name_ckb IS NULL;
UPDATE governorates SET name_ckb = 'واسیت' WHERE name = 'واسط' AND name_ckb IS NULL;
UPDATE governorates SET name_ckb = 'سەڵاحەدین' WHERE name = 'صلاح الدين' AND name_ckb IS NULL;
UPDATE governorates SET name_ckb = 'قادسیە' WHERE name = 'القادسية' AND name_ckb IS NULL;
UPDATE governorates SET name_ckb = 'مەسەنا' WHERE name = 'المثنى' AND name_ckb IS NULL;
UPDATE governorates SET name_ckb = 'مێسان' WHERE name = 'ميسان' AND name_ckb IS NULL;