-- 072_customer_gender_guard.sql
-- الجنس إلزامي لحساب الزبون: ذكر أو أنثى، ولا حالة ثالثة.
--
-- ═══════════════ القرار (2026-10-03، STEP 67، D5) ═══════════════
--
-- عقد المنتج: `gender` مطلوب و∈ {male, female}. التسجيل يفرضه منذ الهجرة ٠٤٠،
-- لكن قيد ٠٤٠ يقبل NULL على مستوى القاعدة. الحسابات التي تحمل NULL اليوم
-- سبقت ٠٤٠ (قاعدة التطوير: ١٢٥ زبوناً أُنشئوا بين 2026-08-20 و2026-09-01،
-- وطُبّقت ٠٤٠ في 2026-09-02، ولا زبون واحد بلا جنس بعدها). هي **شذوذٌ في
-- سلامة البيانات** لا حالةٌ مشروعة — ولا تُحوَّل إلى ذكر أو أنثى أبداً.
--
-- ═══════════════ لماذا زنادٌ لا قيد CHECK الآن ═══════════════
--
-- `CHECK (role <> 'customer' OR gender IS NOT NULL)` يفشل على الصفوف القديمة.
-- ونسخة `NOT VALID` منه تُفحص مع **كل** تحديثٍ للصف — فرفعُ نسخة التوكن عند
-- الإيقاف، أو تغيير كلمة المرور، كان سيفشل لصاحب حسابٍ قديم. الزناد يمنع كل
-- طريقٍ يُنشئ زبوناً بلا جنس أو يعيده إليه، ويترك الصف القديم قابلاً للتحديث
-- في أعمدةٍ أخرى حتى يُكمَل من مصدره (الزبون نفسه في التطبيق، أو المسؤول بعد
-- التحقّق عبر واتساب). القيد المُتحقَّق منه يأتي في إصدارٍ لاحق حين يبلغ عدد
-- الشواذّ صفراً في كل بيئة (`scripts/gender-integrity-diagnostic.sql`).
--
-- يُرفض:
--   • إدراج زبونٍ بلا جنس؛
--   • إفراغ جنس زبونٍ كان له جنس؛
--   • تحويل حسابٍ إلى زبون وهو بلا جنس؛
--   • تفعيل (قبول) زبونٍ بلا جنس — `phone_verified_at` من NULL إلى قيمة.
-- حسابات المسؤولين خارج هذا العقد: لا تُنشأ بالتسجيل، ولا تدخل تحليلات الزبائن.

CREATE FUNCTION enforce_customer_gender() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'customer' AND NEW.gender IS NULL THEN
    IF TG_OP = 'INSERT'
       OR OLD.gender IS NOT NULL
       OR OLD.role IS DISTINCT FROM 'customer'
       OR (OLD.phone_verified_at IS NULL AND NEW.phone_verified_at IS NOT NULL) THEN
      RAISE EXCEPTION 'customer gender is required (male or female)'
        USING ERRCODE = 'check_violation',
              CONSTRAINT = 'users_customer_gender_required';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_customer_gender_guard
  BEFORE INSERT OR UPDATE OF gender, role, phone_verified_at ON users
  FOR EACH ROW EXECUTE FUNCTION enforce_customer_gender();
