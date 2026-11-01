-- يعكس 091_account_deletion.sql — يُسقط ما أنشأته وحده: جدول `account_deletions`
-- وقيد الشكل وعمود `deleted_at`، ويعيد `phone NOT NULL` وقيد الأدوار الأصلي.
-- [CRITICAL] يرفض العمل متى وُجد حسابٌ محذوف: الشاهد بلا رقم لا يعود إلى
-- `phone NOT NULL`، وإسقاط السجلّ يمحو مراجع أُعطيت لأصحابها.
-- معاملةٌ واحدة: الكل أو لا شيء.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE role = 'deleted') OR EXISTS (SELECT 1 FROM account_deletions) THEN
    RAISE EXCEPTION '091 rollback refused: deleted accounts exist';
  END IF;
END;
$$;
DROP INDEX IF EXISTS idx_account_deletions_user;
DROP TABLE IF EXISTS account_deletions;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_deleted_shape;
ALTER TABLE users ALTER COLUMN phone SET NOT NULL;
ALTER TABLE users DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('customer', 'admin'));
DELETE FROM schema_migrations WHERE name = '091_account_deletion.sql';
COMMIT;
