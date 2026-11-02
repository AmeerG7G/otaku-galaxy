-- يعكس 086_search_fold_schema_qualified.sql: يعيد جسمَي 066 حرفياً (`search_fold`
-- بلا تأهيل). لا بيانات تضيع — الدالّتان تعطيان الناتج نفسه.
-- [CRITICAL] يعيد عطل الاستعادة: كل `pg_dump` بعده يفشل في `pg_restore` عند
-- الفهرسين `idx_products_search_ar_trgm` و`idx_products_search_ckb_trgm`. لا يُستعمل
-- إلا لإرجاع القاعدة إلى ما قبل 086 مع نسخةٍ سابقة من الشيفرة.
-- معاملةٌ واحدة (انظر 084.down): الكل أو لا شيء.
BEGIN;
CREATE OR REPLACE FUNCTION product_search_text_ar(name TEXT, description TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT search_fold(COALESCE(name, '') || E'\n' || COALESCE(description, ''));
$$;
CREATE OR REPLACE FUNCTION product_search_text_ckb(
  name TEXT,
  description TEXT,
  name_ckb TEXT,
  description_ckb TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT search_fold(
    COALESCE(NULLIF(btrim(name_ckb), ''), name, '')
    || E'\n' ||
    COALESCE(NULLIF(btrim(description_ckb), ''), description, '')
  );
$$;
REINDEX INDEX idx_products_search_ar_trgm;
REINDEX INDEX idx_products_search_ckb_trgm;
DELETE FROM schema_migrations WHERE name = '086_search_fold_schema_qualified.sql';
COMMIT;
