-- 086_search_fold_schema_qualified.sql
-- دالّتا مستند البحث (066) تستدعيان `public.search_fold` باسمٍ مؤهَّل، كي
-- تُستعاد النسخة الاحتياطية (`pg_dump`/`pg_restore`) بلا خطأ.
--
-- ═══════════════ العطل (بروفة هجرة الاختبار المسبق، 2026-10-25) ═══════════════
--
-- `pg_restore` لنسخةٍ احتياطية حقيقية فشل في فهرسين فقط:
--   idx_products_search_ar_trgm · idx_products_search_ckb_trgm
--   ERROR: function search_fold(text) does not exist
--   CONTEXT: SQL function "product_search_text_ar" during inlining
-- `pg_dump` يكتب في رأس النسخة `search_path = ''` ويؤهِّل كل ما يكتبه هو
-- (`public.product_search_text_ar(...)`، `public.gin_trgm_ops`)، لكن **جسم**
-- دالّة SQL نصٌّ محفوظ كما كُتب. عند `CREATE INDEX` تُدمَج (inline) الدالّة،
-- فيُحلَّل جسمها بمسار البحث الفارغ ولا يُعثر على `search_fold` غير المؤهَّلة.
-- النتيجة: كل نسخةٍ احتياطية من كل بيئة تُستعاد بلا فهرسَي البحث (أو تقف كلياً
-- مع `--exit-on-error`).
--
-- ═══════════════ الإصلاح ═══════════════
--
-- الجسمان من 066 حرفياً، والفرق الوحيد `public.search_fold(...)`. ما عداها في
-- الجسمين (`COALESCE`، `NULLIF`، `btrim`، `||`) من `pg_catalog` الذي يُبحث فيه
-- دائماً، وجسم `search_fold` نفسه (064) كذلك.
--
-- [CRITICAL] لا `SET search_path` على الدالّتين: دالّة SQL تحمل `SET` لا تُدمَج،
-- فيصير كل صفٍّ في البحث استدعاءَ دالّة، ولا يطابق المخطّطُ التعبيرَ بالفهرس
-- كما يفعل الآن. التأهيل في الجسم يكفي ويُبقيهما `IMMUTABLE PARALLEL SAFE`.
--
-- [CRITICAL] لا تُعدَّل 066 نفسها: هي مسجَّلة في كل بيئة ولا تُعاد. `CREATE OR
-- REPLACE` بالتوقيع نفسه يُبقي الفهارس والتعليقات والصلاحيات معلَّقةً بالدالّتين.
--
-- ═══════════════ ما فُحص ولم يحتج تغييراً ═══════════════
--
-- كل فهرس/قيد/قيمة افتراضية في `public` تعتمد على دالّةٍ معرَّفة هنا
-- (`pg_depend`) — الفهرسان أعلاه وحدهما. `franchise_search_text` (025) ليست في
-- أي فهرس، وجسمها لا يستدعي إلا `pg_catalog`. `search_like_pattern` (064)
-- تستدعي `search_fold` بلا تأهيل لكنها لا تدخل فهرساً: تُنفَّذ وقت الاستعلام
-- بمسار بحث التطبيق، لا وقت الاستعادة. العروض يكتبها `pg_dump` مؤهَّلة بنفسه.

CREATE OR REPLACE FUNCTION product_search_text_ar(name TEXT, description TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT public.search_fold(COALESCE(name, '') || E'\n' || COALESCE(description, ''));
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
  SELECT public.search_fold(
    COALESCE(NULLIF(btrim(name_ckb), ''), name, '')
    || E'\n' ||
    COALESCE(NULLIF(btrim(description_ckb), ''), description, '')
  );
$$;

-- نسخةٌ احتياطية أقدم من 086 تُستعاد بلا هذين الفهرسين (الخطآن المتوقَّعان، انظر
-- deploy/README.md §١٦)، ثم تُطبَّق هذه الهجرة عليها: تُنشئهما هنا بتعريف 066
-- حرفياً. على قاعدةٍ سليمة لا تفعل شيئاً.
CREATE INDEX IF NOT EXISTS idx_products_search_ar_trgm
  ON products USING GIN (product_search_text_ar(name, description) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_search_ckb_trgm
  ON products USING GIN (
    product_search_text_ckb(name, description, name_ckb, description_ckb) gin_trgm_ops
  );

-- الناتج لم يتغيّر حرفاً، لكن الفهرس بُني بتعريفٍ سابق: يُعاد بناؤه كي لا يبقى
-- في القاعدة فهرسٌ لا يطابق دالّته الحالية. الكتالوج صغير؛ القفل لحظي.
REINDEX INDEX idx_products_search_ar_trgm;
REINDEX INDEX idx_products_search_ckb_trgm;
