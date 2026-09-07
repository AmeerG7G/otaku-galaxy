import { afterAll, describe, expect, it } from 'vitest';
import { api, DEV_CODE, purgeTestUsers } from './helpers.js';
import { db } from '../src/database/pool.js';
import {
  isValidIraqiPhone,
  normalizeIraqiPhone,
  phoneSearchFragment,
} from '../src/utils/phone.js';

/**
 * تطبيع رقم الهاتف — التنفيذ الوحيد المعتمد.
 *
 * الضمانة الجوهرية: أي صيغة عراقية مشروعة تنتهي إلى **نصّ واحد**
 * (`+9647XXXXXXXXX`). ما دام ذلك صحيحاً فلا يمكن أن يوجد حسابان لرقم واحد،
 * ولا أن تُتجاوز حدودُ إعادة الإرسال بتغيير شكل الكتابة، ولا أن يستلم مزوّد
 * الرسائل رقماً لا يفهمه.
 */
describe('تطبيع رقم الهاتف العراقي', () => {
  const CANONICAL = '+9647701234567';

  it('الصيغ المشروعة كلها تنتهي إلى نصّ واحد', () => {
    for (const input of [
      '07701234567', // المحلية — ما يكتبه المستخدم عادةً
      '7701234567', // بلا صفر البداية
      '9647701234567', // دولية بلا +
      '+9647701234567', // دولية كاملة
      '009647701234567', // بادئة الاتصال الدولي
      '  07701234567  ', // فراغات محيطة تُقلَّم
    ]) {
      expect(normalizeIraqiPhone(input), `المدخل: ${input}`).toBe(CANONICAL);
    }
  });

  it('يقبل نطاقات المحمول العراقية كلها — لا مشغّلاً بعينه', () => {
    // 075 كورك · 076 · 077 آسياسيل · 078 و079 زين. القاعدة نطاقية لا تفضّل
    // مشغّلاً على آخر، فلا يُقصى زبون لأن شريحته من شركة بعينها.
    for (const prefix of ['075', '076', '077', '078', '079']) {
      const local = `${prefix}01234567`;
      expect(normalizeIraqiPhone(local), `النطاق ${prefix}`).toBe(
        `+964${local.slice(1)}`,
      );
    }
  });

  it('[CRITICAL] يرفض ما ليس رقماً عراقياً صالحاً', () => {
    for (const bad of [
      '',
      '   ',
      '123',
      '0770123456', // أقصر بخانة
      '077012345678', // أطول بخانة
      '07001234567', // نطاق غير مخصَّص للمحمول
      '07401234567', // نطاق غير مخصَّص للمحمول
      '+9649647701234567', // رمز دولي مكرَّر
      '+9647701234567890', // أطول من اللازم
      '+1234567890', // رقم غير عراقي
      'abcdefghijk',
      '0770abc4567',
      '+964770123456a',
      'null',
      '٠٧٧٠١٢٣٤٥٦٧', // أرقام هندية-عربية: لا تُقبل بلا تحويل صريح
    ]) {
      expect(normalizeIraqiPhone(bad), `كان يجب رفض: ${JSON.stringify(bad)}`).toBeNull();
    }
  });

  it('[CRITICAL] الفواصل المألوفة توحَّد ولا تُنشئ هويّة ثانية', () => {
    // حقل الهاتف في التطبيق يقترح `0770 123 4567` بفراغاته، فلا يصحّ أن
    // يُعاقَب من اتّبع ما عُرض عليه. والأهم: كلها تنتهي إلى **نصّ واحد**،
    // فلا يصير الفراغ رقماً جديداً بحصّة رموز جديدة ولا يلتفّ على قيد
    // التفرّد — التوحيد هو ما يغلق ذلك الباب لا الرفض.
    for (const written of [
      '0770 123 4567',
      '0770-123-4567',
      '+964 770 123 4567',
      '(0770)123-4567',
      '077.012.345.67',
      '  0770 123 4567  ',
    ]) {
      expect(normalizeIraqiPhone(written), `المكتوب: ${written}`).toBe(CANONICAL);
    }
  });

  it('[CRITICAL] محارف التحكّم **داخل** الرقم مرفوضة — ليست فواصل هاتف', () => {
    // سطرٌ جديد أو جدولة داخل رقم علامةُ لصقٍ فاسد أو محاولة حقن، لا خطأ كتابة.
    for (const bad of ['077\t01234567', '0770\r1234567', '0770\n1234567']) {
      expect(normalizeIraqiPhone(bad), `كان يجب رفض: ${JSON.stringify(bad)}`).toBeNull();
    }
  });

  it('الفراغ المحيط — بما فيه سطرٌ لاحق — يُقلَّم كما هو متوقَّع', () => {
    // لصقٌ من رسالة يجرّ معه سطراً في الطرف؛ لا معنى لمعاقبة المستخدم عليه.
    for (const padded of ['07701234567\n', '\n07701234567', '\t07701234567 ']) {
      expect(normalizeIraqiPhone(padded), `المدخل: ${JSON.stringify(padded)}`).toBe(CANONICAL);
    }
  });

  it('غير النصوص مرفوضة بلا استثناء', () => {
    for (const v of [null, undefined, 7701234567, {}, [], true]) {
      expect(normalizeIraqiPhone(v)).toBeNull();
    }
  });

  it('التطبيع ثابت: تطبيعُ المطبَّع لا يغيّره', () => {
    expect(normalizeIraqiPhone(CANONICAL)).toBe(CANONICAL);
    expect(normalizeIraqiPhone(normalizeIraqiPhone('07701234567'))).toBe(CANONICAL);
  });

  it('`isValidIraqiPhone` يتبع القاعدة نفسها', () => {
    expect(isValidIraqiPhone('07701234567')).toBe(true);
    expect(isValidIraqiPhone('07001234567')).toBe(false);
  });

  it('مقطع البحث يوحّد ما يكتبه المسؤول', () => {
    // الصيغ الثلاث تنتهي إلى مقطع موجود داخل المخزَّن `+9647701234567`.
    expect(phoneSearchFragment('07701234567')).toBe('7701234567');
    expect(phoneSearchFragment('+9647701234567')).toBe('9647701234567');
    expect(phoneSearchFragment('0770 123')).toBe('770123');
    expect(phoneSearchFragment('ab')).toBeNull();
  });
});

/**
 * التطبيع من طرف إلى طرف: ما يُكتب في الطلب مقابل ما يُخزَّن في القاعدة.
 */
describe('التطبيع عبر مسارات المصادقة', () => {
  const CANONICAL_ORDER_PHONE = '+9647701234567';

  afterAll(async () => {
    await purgeTestUsers();
  });

  /** رقم فريد لكل حالة كي لا تتداخل الحالات على حدود إعادة الإرسال. */
  let seq = 0;
  const freshLocal = () => {
    seq += 1;
    return `077${String(Date.now()).slice(-6)}${String(seq).padStart(2, '0')}`;
  };

  it('[CRITICAL] يُسجَّل بصيغة ويدخل بأخرى — الحساب واحد', async () => {
    const local = freshLocal();
    const canonical = `+964${local.slice(1)}`;

    await api
      .post('/api/auth/register')
      .send({ username: 'مختبر التطبيع', phone: local, password: 'secret123',
        gender: 'male',
      })
      .expect(200);
    await api.post('/api/auth/verify').send({ phone: local, code: DEV_CODE }).expect(200);

    // الدخول بالصيغة الدولية لحسابٍ سُجّل بالمحلية: لولا التطبيع لكان
    // «رقماً آخر» ولفشل الدخول.
    const login = await api
      .post('/api/auth/login')
      .send({ phone: canonical, password: 'secret123' })
      .expect(200);
    expect(login.body.data.user.phone).toBe(canonical);

    // وبصيغة `00964` أيضاً.
    await api
      .post('/api/auth/login')
      .send({ phone: `00964${local.slice(1)}`, password: 'secret123' })
      .expect(200);

    const { rows } = await db.query<{ phone: string }>(
      'SELECT phone FROM users WHERE phone = $1',
      [canonical],
    );
    expect(rows).toHaveLength(1);

    await db.query('DELETE FROM verification_codes WHERE phone = $1', [canonical]);
    await db.query('DELETE FROM users WHERE phone = $1', [canonical]);
  });

  it('[CRITICAL] لا يُنشأ حسابان لرقم واحد بصيغتين', async () => {
    const local = freshLocal();
    const canonical = `+964${local.slice(1)}`;

    await api
      .post('/api/auth/register')
      .send({ username: 'الأول', phone: local, password: 'secret123',
        gender: 'male',
      })
      .expect(200);
    await api.post('/api/auth/verify').send({ phone: local, code: DEV_CODE }).expect(200);

    // التسجيل ثانيةً بالصيغة الدولية يجب أن يصطدم بالحساب نفسه لا أن يُنشئ ثانياً.
    const again = await api
      .post('/api/auth/register')
      .send({ username: 'الثاني', phone: canonical, password: 'secret123',
        gender: 'male',
      });
    expect(again.status).toBeGreaterThanOrEqual(400);

    const { rows } = await db.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM users
        WHERE phone IN ($1, $2)`,
      [canonical, local],
    );
    expect(rows[0]!.total).toBe('1');

    await db.query('DELETE FROM verification_codes WHERE phone = $1', [canonical]);
    await db.query('DELETE FROM users WHERE phone = $1', [canonical]);
  });

  it('الرقم غير الصالح يُرفض بـ400 على كل مسارات المصادقة', async () => {
    for (const path of ['/api/auth/register', '/api/auth/login', '/api/auth/forgot-password']) {
      const res = await api
        .post(path)
        .send({ username: 'مختبر', phone: '07001234567', password: 'secret123', gender: 'male' });
      expect(res.status, path).toBe(400);
      expect(res.body.error.code, path).toBe('VALIDATION_ERROR');
    }
  });

  it('رقم الطلب يُطبَّع هو الآخر — تمثيل واحد للحساب وطلباته', async () => {
    // `createOrderSchema` يستعمل نفس الدالة، فلا يمكن أن يُخزَّن رقم الطلب
    // بصيغة ورقم صاحبه بأخرى.
    const { createOrderSchema } = await import('../src/validators/orders.js');
    const parsed = createOrderSchema.safeParse({
      governorateId: '00000000-0000-0000-0000-000000000000',
      fullAddress: 'بغداد، الكرادة، قرب الجامعة',
      phone: '07701234567',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.phone).toBe(CANONICAL_ORDER_PHONE);
  });
});
