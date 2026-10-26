-- تطهير بيانات الأداء — الهوية نفسها حرفياً في الهجرة ٠٦١ (انظر رأسها).
-- [CRITICAL] لا حذف ببادئة الهاتف وحدها: ‎+96479 أرقام زين حقيقية. الزبون
-- المزيف = اسم `perf-user-N` + هاتف `+96479` بثمانية أرقام + تجزئة 'x'.
-- يحرسه `tests/migration-061-perf-purge.test.ts` (يقارن النصّين).
BEGIN;

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

COMMIT;
