-- 033_store_social_description.sql
-- وصف واحد قابل للتحرير يُعرض تحت روابط التواصل في شاشة الحساب.
-- قيمة فارغة تعني «لا وصف»؛ يبقى سلوك التطبيق الحالي حتى تُضبط القيمة.

INSERT INTO store_settings (key, value) VALUES ('social_description', '')
ON CONFLICT (key) DO NOTHING;