-- 073_business_scope.sql
-- تصنيف الطلبات للتحليلات: طلبات الزبائن الفعلية مقابل طلبات المسؤولين/الاختبار.
--
-- ═══════════════ القرار (2026-10-03، STEP 67، D2) ═══════════════
--
-- يُستبعد الطلب من تحليلات المتجر **إذا وفقط إذا**:
--   ١. `orders.placed_by_role <> 'customer'` — دور صاحب الحساب **ساعة الطلب**؛ أو
--   ٢. صاحب الحساب معلَّمٌ `users.is_internal_account = TRUE` (حساب اختبار/داخلي
--      يعلّمه المسؤول الأعلى وحده، ويُسجَّل في سجلّ النشاط).
--
-- لماذا لقطةٌ لا الدور الحالي: الدور يتغيّر. `scripts/seedAdmin.ts` يرقّي رقماً
-- موجوداً إلى مسؤول (`ON CONFLICT (phone) DO UPDATE SET role = 'admin'`)، فلو
-- قُرئ الدور الحالي لانقلبت مشتريات زبونٍ حقيقي سابقة إلى «طلبات إدارية»
-- بصمت. اللقطة تُكتب بزنادٍ عند الإدراج من صفّ المستخدم نفسه — لكل طريق إدراج،
-- ولا تقبل قيمةً يرسلها مستدعٍ — ولا تتغيّر بعدها.
--
-- التعبئة لمرّةٍ واحدة من الدور ساعةَ هذه الهجرة: هو الدليل الوحيد المتاح عن
-- الطلبات السابقة (موثَّق). لا يمرّ التحديث بزناد `updated_at`: التعبئة لا
-- تغيّر الطلب نفسه، ولا يجوز أن تبدو كأن كل طلبٍ عُدِّل الآن.
--
-- لا أنماط أرقام هواتف ولا أسماء في التصنيف أبداً.

ALTER TABLE users
  ADD COLUMN is_internal_account BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE orders ADD COLUMN placed_by_role TEXT;

ALTER TABLE orders DISABLE TRIGGER trg_orders_updated_at;
UPDATE orders o SET placed_by_role = u.role FROM users u WHERE u.id = o.user_id;
ALTER TABLE orders ENABLE TRIGGER trg_orders_updated_at;

ALTER TABLE orders
  ALTER COLUMN placed_by_role SET NOT NULL,
  ADD CONSTRAINT orders_placed_by_role_known CHECK (placed_by_role IN ('customer', 'admin'));

-- اللقطة تُشتقّ دائماً من صاحب الطلب ساعة الإدراج، ولا تتغيّر بعدها.
CREATE FUNCTION snapshot_order_placed_by_role() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.placed_by_role := (SELECT u.role FROM users u WHERE u.id = NEW.user_id);
  ELSIF NEW.placed_by_role IS DISTINCT FROM OLD.placed_by_role THEN
    RAISE EXCEPTION 'orders.placed_by_role is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_placed_by_role
  BEFORE INSERT OR UPDATE OF placed_by_role ON orders
  FOR EACH ROW EXECUTE FUNCTION snapshot_order_placed_by_role();
