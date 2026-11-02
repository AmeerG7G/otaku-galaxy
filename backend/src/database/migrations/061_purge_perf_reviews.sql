-- 061_purge_perf_reviews.sql
-- إزالة بيانات الأداء المزيفة (perf-dataset) — وهي وحدها.
--
-- ═══ القرار ═══
-- `perf-dataset.sql` يزرع ٣٬٠٠٠ زبون و١٠٬٠٠٠ منتج وطلب وتقييم لغرض اختبار
-- الأداء (#5). هذه البيانات ليست حقيقية ولا ينبغي أن تبقى في قاعدة دائمة؛
-- الهجرة تضمن التنظيف في أي بيئة تُطبَّق عليها الهجرات إن زُرعت فيها خطأً.
-- `tests/fixtures/perf-dataset-purge.sql` يطبّق الهوية نفسها حرفياً.
--
-- ═══ [CRITICAL] هوية الزبون المزيف — لا بادئة الهاتف وحدها ═══
-- كانت النسخة الأولى تحذف بـ`phone LIKE '+96479%'` وحده. ‎+96479 بادئة زين
-- العراق الحقيقية (`utils/phone.ts`: ‎`^7[5-9]\d{8}$`): في قاعدة التطوير
-- ثلاثة زبائن حقيقيون يطابقونها، واثنان منهم لهم طلبات. كان التشغيل إمّا
-- يفشل على `orders.user_id RESTRICT` فيوقف كل هجرةٍ بعده، أو — حيث لا طلبات —
-- يمحو زبائن حقيقيين بكل ما يتتالى عنهم (نقاط، تقييمات، سلال، إشعارات…).
--
-- الزبون المزيف هو ما يطابق العلامات الثلاث معاً كما يزرعها الملف:
--   username ~ '^perf-user-[0-9]+$'
--   phone    ~ '^\+96479[0-9]{8}$'
--   password_hash = 'x'   ← لا يملكها حسابٌ حقيقي: كل مسار إنشاءٍ أو تغييرٍ
--                           لكلمة المرور يخزّن تجزئة bcrypt (60 محرفاً).
-- واسم المستخدم وحده لا يكفي أيضاً: الزبون يختار اسمه بحرّية.
--
-- وما سوى الزبائن مقيَّدٌ بهم أو بقسم الأداء:
--   orders:   number ~ '^perf-[0-9]+$' ولصاحبٍ مزيف (أرقام الطلبات الحقيقية
--             من `order_number_seq` أرقامٌ فقط)
--   products: name ~ '^perf-product-[0-9]+$' داخل القسم 'perf-cat'
--   القسم 'perf-cat' والمحافظة 'perf-gov' لا تُحذفان إلا إن خلتا من غيرها.
--
-- ═══ لا تفشل ولا تتجاوز ═══
-- ما يربطه صفٌّ حقيقي يُترك لا يُحذف (زبونٌ مزيف له طلب غير مزيف، قسمٌ فيه
-- منتج حقيقي): القيود RESTRICT كانت ستُسقط الهجرة كلها، والحذف بالتتالي
-- كان سيمسّ بيانات حقيقية. الحذف متساوي القوة: تشغيلٌ ثانٍ لا يجد شيئاً.
--
-- ═══ بلا BEGIN/COMMIT ═══
-- المشغّل (`scripts/migrate.ts`) يلفّ كل ملف بمعاملته ويسجّله فيها؛ `COMMIT`
-- داخل الملف كان يُنهي تلك المعاملة قبل تسجيل الهجرة، ويجعل اختبارها داخل
-- معاملةٍ تُرجَع (`tests/migration-061-perf-purge.test.ts`) يحذف فعلاً.

DROP TABLE IF EXISTS perf_purge_users;
CREATE TEMP TABLE perf_purge_users ON COMMIT DROP AS
SELECT id
  FROM users
 WHERE username ~ '^perf-user-[0-9]+$'
   AND phone ~ '^\+96479[0-9]{8}$'
   AND password_hash = 'x';

-- 1) طلبات الأداء لأصحابها المزيفين. يتتالى عنها: البنود، سجلّ الحالة،
--    التقييمات، إشعارات الطلب، استعمال خصم الميلاد.
DELETE FROM orders
 WHERE number ~ '^perf-[0-9]+$'
   AND user_id IN (SELECT id FROM perf_purge_users);

-- 2) الزبائن المزيفون الذين لم يبقَ لهم طلب. يتتالى عنهم: النقاط، التقييمات،
--    الإشعارات، السلال، المفضلة، المجموعات، أجهزة الإشعار، التفضيلات.
DELETE FROM users u
 WHERE u.id IN (SELECT id FROM perf_purge_users)
   AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id);

-- 3) منتجات الأداء داخل قسم الأداء وحده. يتتالى عنها: الصور، الخيارات،
--    الامتيازات، وأي إشارة إليها في سلة أو مفضلة.
DELETE FROM products p
 USING categories c
 WHERE c.id = p.category_id
   AND c.name = 'perf-cat'
   AND p.name ~ '^perf-product-[0-9]+$';

-- 4) القسم (وأقسامه الفرعية بالتتالي) والمحافظة — إن خلت من غيرها فقط.
DELETE FROM categories c
 WHERE c.name = 'perf-cat'
   AND NOT EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id);

DELETE FROM governorates g
 WHERE g.name = 'perf-gov'
   AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.governorate_id = g.id);
