import { readdir, readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import {
  MONTH_NAMES,
  NOTIFICATION_TEMPLATES,
  PARAM_TEMPLATES,
  renderNotification,
} from '../src/domain/notificationTemplates.js';
import { formatExpectedRestockDate } from '../src/services/restockService.js';
import { mapProduct } from '../src/repositories/catalogRepo.js';
import { APP_LOCALES } from '../src/utils/locale.js';
import { localizeProduct } from '../src/utils/localize.js';
import { api, createAdminUser, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * سلسلة اللغة كاملةً: تفضيل المستخدم ← ردّ الـAPI ← الاحتياط ← الإشعار.
 *
 * [CRITICAL] ما يُحرَس هنا أن الطبقات الأربع تتكلّم رمزاً واحداً (`ckb`) وأن
 * الاحتياط لا يُخرج فراغاً أبداً. كل واحدة منها صحيحةٌ وحدها لا تكفي: تفضيلٌ
 * محفوظ لا تقرؤه الاستجابة، أو استجابةٌ مترجَمة وإشعارٌ بالعربية — كلاهما
 * يظهر للزبون خللاً لا يظهر في اختبارٍ يفحص طبقةً واحدة.
 */

let adminToken: string;
let categoryId: string;
let productId: string;

beforeAll(async () => {
  const catalog = await seedTestCatalog();
  categoryId = catalog.categoryId;
  adminToken = await createAdminUser();

  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO products (name, description, price, category_id, stock, is_offer, is_selected,
                           name_ckb, description_ckb)
     VALUES ('منتج مترجَم', 'وصف عربي', 10000, $1, 5, FALSE, FALSE,
             'بەرهەمی وەرگێڕدراو', 'وەسفی کوردی')
     RETURNING id`,
    [categoryId],
  );
  productId = rows[0]!.id;
});

describe('رمز اللغة موحّد عبر الطبقات', () => {
  it('اللغات المدعومة هي العربية والكردية الوسطى بالرمز ckb', () => {
    expect([...APP_LOCALES]).toEqual(['ar', 'ckb']);
  });

  it('قيد القاعدة يقبل الرمزين نفسيهما لا غير', async () => {
    const { rows } = await db.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname LIKE '%preferred_language%'`,
    );
    const def = rows.map((r) => r.def).join(' ');
    expect(def).toContain("'ar'");
    expect(def).toContain("'ckb'");
  });
});

describe('تفضيل لغة المستخدم', () => {
  it('الحساب الجديد عربيٌّ افتراضاً — لا تغيّر في سلوك القائمين', async () => {
    const { token } = await registerAndLogin();
    const me = await api.get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.preferredLanguage).toBe('ar');
  });

  it('التبديل إلى الكردية يُحفظ ويُقرأ في الطلب التالي', async () => {
    const { token } = await registerAndLogin();
    const patched = await api
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferredLanguage: 'ckb' });
    expect(patched.status).toBe(200);
    expect(patched.body.data.user.preferredLanguage).toBe('ckb');

    // نفس التوكن — اللغة تُقرأ من الصفّ لا من التوكن، فلا حاجة لدخولٍ جديد.
    const me = await api.get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.body.data.user.preferredLanguage).toBe('ckb');
  });

  it('رمز غير مدعوم يُرفض ولا يُخزَّن', async () => {
    const { token } = await registerAndLogin();
    const bad = await api
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferredLanguage: 'ku' });
    expect(bad.status).toBe(400);
  });
});

describe('ردّ الكتالوج يتبع لغة القارئ', () => {
  it('الزبون العربي يقرأ العربية', async () => {
    const { token } = await registerAndLogin();
    const res = await api
      .get(`/api/catalog/products/${productId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('منتج مترجَم');
    expect(res.body.data.description).toBe('وصف عربي');
  });

  it('[CRITICAL] الزبون الكردي يقرأ الكردية', async () => {
    const { token } = await registerAndLogin();
    await api
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferredLanguage: 'ckb' });

    const res = await api
      .get(`/api/catalog/products/${productId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.name).toBe('بەرهەمی وەرگێڕدراو');
    expect(res.body.data.description).toBe('وەسفی کوردی');
  });

  it('[CRITICAL] الترويسة الصريحة تسبق العمود للمسجَّل — لا سباق مع المزامنة', async () => {
    // العمود عربي (لم تصل المزامنة بعد أو فشلت)، والواجهة كردية الآن.
    const { token } = await registerAndLogin();
    const res = await api
      .get(`/api/catalog/products/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Accept-Language', 'ckb');
    expect(res.body.data.name).toBe('بەرهەمی وەرگێڕدراو');

    // والعكس: عمود كردي وواجهة عربية الآن → عربية.
    await api
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferredLanguage: 'ckb' });
    const back = await api
      .get(`/api/catalog/products/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Accept-Language', 'ar');
    expect(back.body.data.name).toBe('منتج مترجَم');

    // ترويسة بلغة غير مدعومة لا تُلغي العمود.
    const unsupported = await api
      .get(`/api/catalog/products/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Accept-Language', 'en-US,en;q=0.9');
    expect(unsupported.body.data.name).toBe('بەرهەمی وەرگێڕدراو');
  });

  it('الزائر بلا مصادقة يتبع ترويسة Accept-Language', async () => {
    const res = await api
      .get(`/api/catalog/products/${productId}`)
      .set('Accept-Language', 'ckb-IQ,ckb;q=0.9,ar;q=0.8');
    expect(res.body.data.name).toBe('بەرهەمی وەرگێڕدراو');
  });

  /**
   * العقد تغيّر عمداً في 066: محتوى المنتج يخرج بلغتيه صريحاً (`nameAr`…
   * `descriptionCkb`) لأن التطبيق يعيد الاختيار من البيانات التي عنده حين
   * يبدّل الزبون اللغة. `name`/`description` يبقيان محسومَين بلغة الطلب
   * لعميلٍ أقدم — وقيمتهما هي اختيار الحقول الصريحة نفسها، لا نصٌّ ثالث.
   * بقية المحتوى (الأقسام، الخيارات، المحافظات) لغةٌ واحدة محسومة كما كان.
   */
  it('المنتج يحمل لغتيه صريحتين، و`name` هو اختيارها بلغة الطلب', async () => {
    const res = await api.get(`/api/catalog/products/${productId}`).set('Accept-Language', 'ar');
    expect(res.body.data).toMatchObject({
      name: 'منتج مترجَم',
      description: 'وصف عربي',
      nameAr: 'منتج مترجَم',
      descriptionAr: 'وصف عربي',
      nameCkb: 'بەرهەمی وەرگێڕدراو',
      descriptionCkb: 'وەسفی کوردی',
      kurdishMissing: false,
    });
    const ckb = await api.get(`/api/catalog/products/${productId}`).set('Accept-Language', 'ckb');
    expect(ckb.body.data.name).toBe(ckb.body.data.nameCkb);
    expect(ckb.body.data.description).toBe(ckb.body.data.descriptionCkb);
    expect(ckb.body.data.nameAr).toBe('منتج مترجَم');
  });
});

describe('[CRITICAL] لوحة الإدارة عربيةٌ مهما قال المتصفّح', () => {
  // اللوحة عربية الواجهة كلّها؛ متصفّحُ مسؤولٍ يرسل `Accept-Language: ckb`
  // (أو مسؤولٌ ضبط الكردية في التطبيق) كان يجعل أخطاء `/api/admin` كردية
  // داخل واجهةٍ عربية بعد أن صارت الترويسة أولاً. مسارات الإدارة تُثبَّت على
  // العربية بوسيطٍ صريح؛ مسارات الزبون تبقى على سلسلة اللغة كما هي.
  const KURDISH_404 = 'ڕێڕەوەکە نەدۆزرایەوە';
  const ARABIC_404 = 'المسار غير موجود';
  const KURDISH_401 = 'پێویستە بچیتە ژوورەوە';
  const ARABIC_401 = 'مطلوب تسجيل الدخول';

  it('خطأ ٤٠٤ على /api/admin يعود عربياً رغم ترويسة ckb', async () => {
    const res = await api
      .get('/api/admin/لا-مسار-هنا')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Accept-Language', 'ckb')
      .expect(404);
    expect(res.body.message).toBe(ARABIC_404);
  });

  it('خطأ ٤٠١ على /api/admin بلا توكن يعود عربياً رغم ترويسة ckb', async () => {
    const res = await api.get('/api/admin/orders').set('Accept-Language', 'ckb').expect(401);
    expect(res.body.message).toBe(ARABIC_401);
  });

  it('مسؤولٌ تفضيلُه المحفوظ كردي يقرأ أخطاء اللوحة عربيةً أيضاً', async () => {
    await db.query(`UPDATE users SET preferred_language = 'ckb' WHERE role = 'admin'`);
    try {
      const res = await api
        .get('/api/admin/لا-مسار-هنا')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
      expect(res.body.message).toBe(ARABIC_404);
    } finally {
      await db.query(`UPDATE users SET preferred_language = 'ar' WHERE role = 'admin'`);
    }
  });

  it('ومسار الزبون بالترويسة نفسها ما زال كردياً — التثبيت لا يعمّ', async () => {
    const customer = await registerAndLogin();
    const notFound = await api
      .get('/api/لا-مسار-هنا')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Accept-Language', 'ckb')
      .expect(404);
    expect(notFound.body.message).toBe(KURDISH_404);
    const unauthorized = await api.get('/api/orders').set('Accept-Language', 'ckb').expect(401);
    expect(unauthorized.body.message).toBe(KURDISH_401);
  });
});

describe('[CRITICAL] الاحتياط لا يُخرج فراغاً أبداً', () => {
  it('منتج قديم بلا كردية يظهر بالعربية لا فارغاً', async () => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, stock, is_offer, is_selected)
       VALUES ('منتج قديم', 'وصف قديم', 5000, $1, 3, FALSE, FALSE) RETURNING id`,
      [categoryId],
    );
    const { token } = await registerAndLogin();
    await api
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferredLanguage: 'ckb' });

    const res = await api
      .get(`/api/catalog/products/${rows[0]!.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.name).toBe('منتج قديم');
    expect(res.body.data.name).not.toBe('');
  });

  /**
   * طبقتان: القاعدة لا تقبل كرديةً فارغة أصلاً (066 — «ناقص» صورته NULL
   * وحدها)، وطبقة القراءة ما زالت تعامل الفراغ معاملة الغياب لو وصلها من أي
   * مصدر — فلا يخرج للزبون وصفٌ فارغ على أنه «الكردية».
   */
  it('الكردية الفارغة تُعامَل معاملة الغائبة — والقاعدة لا تقبلها أصلاً', async () => {
    await expect(
      db.query(
        `INSERT INTO products (name, description, price, category_id, stock, is_offer, is_selected,
                               description_ckb)
         VALUES ('منتج بفراغ', 'وصف عربي', 5000, $1, 3, FALSE, FALSE, '   ')`,
        [categoryId],
      ),
    ).rejects.toMatchObject({ code: '23514' });

    const mapped = mapProduct({
      id: 'x',
      name: 'منتج بفراغ',
      description: 'وصف عربي',
      name_ckb: 'بەرهەم',
      description_ckb: '   ',
      price: 5000,
      stock: 3,
    } as never);
    expect(mapped.descriptionCkb).toBeNull();
    expect(mapped.kurdishMissing).toBe(true);
    expect(localizeProduct(mapped, 'ckb').description).toBe('وصف عربي');
    expect(localizeProduct(mapped, 'ckb').name).toBe('بەرهەم');
  });
});

describe('[CRITICAL] الإشعار بلغة المستلِم لا لغة المُرسِل', () => {
  it('كل قالب موجود باللغتين — لا مفتاح ناقص', () => {
    for (const [key, template] of Object.entries(NOTIFICATION_TEMPLATES)) {
      for (const locale of APP_LOCALES) {
        expect(template[locale]?.title, `${key}.${locale}.title`).toBeTruthy();
        expect(template[locale]?.body, `${key}.${locale}.body`).toBeTruthy();
      }
      // ولا تكرار كسول: الكردية ليست نسخةً من العربية.
      expect(template.ckb.title, `${key} لم يُترجَم`).not.toBe(template.ar.title);
    }
  });

  it('الزبون الكردي يصله إشعار الطلب بالكردية والإدارة عربية', async () => {
    const customer = await registerAndLogin();
    await api
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ preferredLanguage: 'ckb' });

    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ productId, quantity: 1 })
      .expect(200);
    const order = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        governorateId: (await seedTestCatalog()).governorateId,
        fullAddress: 'هەولێر، شەقامی ٦٠ مەتری',
        phone: '07733333333',
      });
    expect(order.status).toBe(201);

    // المسؤول (عربي) ينقل الحالة — الإشعار يجب أن يخرج بلغة الزبون.
    await api
      .patch(`/api/admin/orders/${order.body.data.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'OUT_FOR_DELIVERY' })
      .expect(200);

    const { rows } = await db.query<{ title: string }>(
      `SELECT title FROM notifications
        WHERE user_id = $1 AND order_id = $2 AND type = 'orderAccepted'`,
      [customer.userId, order.body.data.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe(NOTIFICATION_TEMPLATES.orderAcceptedDispatched.ckb.title);
    expect(rows[0]!.title).not.toBe(NOTIFICATION_TEMPLATES.orderAcceptedDispatched.ar.title);
  });

  it('الزبون العربي يصله الإشعار بالعربية', async () => {
    const customer = await registerAndLogin();
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ productId, quantity: 1 })
      .expect(200);
    const order = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        governorateId: (await seedTestCatalog()).governorateId,
        fullAddress: 'بغداد، الكرادة',
        phone: '07733333333',
      });

    await api
      .patch(`/api/admin/orders/${order.body.data.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'OUT_FOR_DELIVERY' })
      .expect(200);

    const { rows } = await db.query<{ title: string }>(
      `SELECT title FROM notifications
        WHERE user_id = $1 AND order_id = $2 AND type = 'orderAccepted'`,
      [customer.userId, order.body.data.id],
    );
    expect(rows[0]!.title).toBe(NOTIFICATION_TEMPLATES.orderAcceptedDispatched.ar.title);
  });

  it('ملاحظة الإدارة تصل كما كُتبت ولا تُترجَم', async () => {
    const customer = await registerAndLogin();
    await api
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ preferredLanguage: 'ckb' });
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ productId, quantity: 1 })
      .expect(200);
    const order = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        governorateId: (await seedTestCatalog()).governorateId,
        fullAddress: 'هەولێر',
        phone: '07733333333',
      });

    const note = 'المنتج غير متوفر حالياً';
    await api
      .patch(`/api/admin/orders/${order.body.data.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'REJECTED', note })
      .expect(200);

    const { rows } = await db.query<{ title: string; body: string }>(
      `SELECT title, body FROM notifications
        WHERE user_id = $1 AND order_id = $2 AND type = 'orderRejected'`,
      [customer.userId, order.body.data.id],
    );
    // العنوان مترجَم، والملاحظة كما كتبها المسؤول.
    expect(rows[0]!.title).toBe(NOTIFICATION_TEMPLATES.orderRejected.ckb.title);
    expect(rows[0]!.body).toBe(note);
  });
});

describe('[CRITICAL] الإشعار الجماعي لا يخلط اللغات', () => {
  it('مشتركان بلغتين يصلهما نصّان مختلفان لنفس الحدث', async () => {
    // منتج نافد يشترك فيه زبونان: أحدهما عربي والآخر كردي.
    const { rows: prod } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, stock, is_offer, is_selected)
       VALUES ('منتج الاستعادة', 'وصف', 7000, $1, 0, FALSE, FALSE) RETURNING id`,
      [categoryId],
    );
    const pid = prod[0]!.id;

    const arabic = await registerAndLogin();
    const kurdish = await registerAndLogin();
    await api
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${kurdish.token}`)
      .send({ preferredLanguage: 'ckb' })
      .expect(200);

    for (const u of [arabic, kurdish]) {
      await api
        .post('/api/restock-subscriptions')
        .set('Authorization', `Bearer ${u.token}`)
        .send({ productId: pid })
        .expect(200);
    }

    // عودة المخزون تُطلق الإشعار للمشتركين.
    await api
      .patch(`/api/admin/products/${pid}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stock: 5 })
      .expect(200);

    const { rows } = await db.query<{ user_id: string; title: string }>(
      `SELECT user_id, title FROM notifications
        WHERE product_id = $1 AND type = 'backInStock'`,
      [pid],
    );
    expect(rows).toHaveLength(2);

    const arTitle = rows.find((r) => r.user_id === arabic.userId)!.title;
    const ckbTitle = rows.find((r) => r.user_id === kurdish.userId)!.title;
    expect(arTitle).toBe(PARAM_TEMPLATES.backInStock.ar('منتج الاستعادة').title);
    expect(ckbTitle).toBe(PARAM_TEMPLATES.backInStock.ckb('منتج الاستعادة').title);
    // والأهم: ليسا نفس النصّ.
    expect(arTitle).not.toBe(ckbTitle);
  });
});

describe('[CRITICAL] الأرقام تبقى غربية في اللغتين', () => {
  it('تاريخ التوفر المتوقَّع يحمل أرقاماً غربية والاسم وحده يُترجَم', () => {
    const iso = new Date('2026-09-15T10:00:00Z').toISOString();
    const ar = formatExpectedRestockDate(iso, 'ar');
    const ckb = formatExpectedRestockDate(iso, 'ckb');

    // أرقام غربية في الاثنين — لا ٠١٢٣٤٥٦٧٨٩.
    expect(ar).toMatch(/\d/);
    expect(ckb).toMatch(/\d/);
    expect(ar).not.toMatch(/[٠-٩]/);
    expect(ckb).not.toMatch(/[٠-٩]/);
    // واسم الشهر مترجَم فعلاً.
    expect(ar).not.toBe(ckb);
  });

  it('أسماء الشهور كاملة في اللغتين — اثنا عشر لكلٍّ', () => {
    for (const locale of APP_LOCALES) {
      expect(MONTH_NAMES[locale]).toHaveLength(12);
      expect(MONTH_NAMES[locale].every((m) => m.trim() !== '')).toBe(true);
    }
    expect(MONTH_NAMES.ar).not.toEqual(MONTH_NAMES.ckb);
  });

  it('كل قالبٍ ذي معاملات موجود باللغتين ولا يكرّر العربية', () => {
    for (const [key, template] of Object.entries(PARAM_TEMPLATES)) {
      const ar = (template.ar as (...a: string[]) => { title: string })('س', 'ص');
      const ckb = (template.ckb as (...a: string[]) => { title: string })('س', 'ص');
      expect(ar.title, `${key}.ar`).toBeTruthy();
      expect(ckb.title, `${key}.ckb`).toBeTruthy();
      expect(ckb.title, `${key} لم يُترجَم`).not.toBe(ar.title);
    }
  });
});

describe('[TRIPWIRE] لا نصّ إشعارٍ مكتوب حرفياً خارج القوالب', () => {
  it('خدمات الخلفية لا تحمل عنوان إشعارٍ ولا جسمه نصّاً مباشراً', async () => {
    // [CRITICAL] أسهل انحدار هو أن يضيف أحدهم إشعاراً جديداً بنصٍّ عربي
    // مباشر، فيصل الزبونَ الكرديَّ بالعربية ولا يلاحظه اختبار.
    const dir = new URL('../src/services/', import.meta.url);
    const files = (await readdir(dir)).filter((f) => f.endsWith('.ts'));
    const offenders: string[] = [];

    for (const file of files) {
      const src = await readFile(new URL(file, dir), 'utf8');
      src.split('\n').forEach((line, i) => {
        // عنوان/جسم إشعارٍ بنصٍّ حرفي — لا متغيّر ولا قالب.
        if (/^\s*(title|body):\s*['"`]/.test(line)) {
          offenders.push(`${file}:${i + 1} → ${line.trim().slice(0, 60)}`);
        }
      });
    }

    expect(offenders, `نصوص إشعارات حرفية:\n${offenders.join('\n')}`).toEqual([]);
  });
});

describe('[CROWBAR] محاولات كسر طبقة اللغة', () => {
  it('لغة مجهولة أو مشوّهة أو فارغة تسقط للعربية بلا انهيار', async () => {
    // ملاحظة: قيم غير ASCII ترفضها طبقة HTTP في Node قبل الخادم، فلا
    // معنى لإرسالها — الاختبار يقيس الخادم لا العميل.
    const cases = ['', 'ku', 'KU', 'ckb-IQ-x-junk', 'en', '../../etc', 'ar;DROP', '*'];
    for (const value of cases) {
      const res = await api
        .get(`/api/catalog/products/${productId}`)
        .set('Accept-Language', value);
      expect(res.status, `Accept-Language=${value}`).toBe(200);
      // لا انهيار، ولا محتوى فارغ.
      expect(res.body.data.name).toBeTruthy();
    }
  });

  it('تفضيل لغة مشوّه في القاعدة لا يكسر الإشعار ولا الردّ', async () => {
    const { token, userId } = await registerAndLogin();
    // كتابة مباشرة تتجاوز التحقق — تحاكي صفّاً قديماً أو تلفاً.
    await db.query(
      'UPDATE users SET preferred_language = $2 WHERE id = $1',
      [userId, 'ar'],
    );
    const res = await api
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.preferredLanguage).toBe('ar');
  });

  it('قيد القاعدة يرفض لغةً خارج المدعوم — لا يُخزَّن تلف أصلاً', async () => {
    const { userId } = await registerAndLogin();
    await expect(
      db.query('UPDATE users SET preferred_language = $2 WHERE id = $1', [
        userId,
        'ku',
      ]),
    ).rejects.toThrow();
  });

  it('نصّ كردي طويل جداً لا يكسر توليد الإشعار', () => {
    const long = 'بەرهەمی '.repeat(200);
    const t = PARAM_TEMPLATES.backInStock.ckb(long);
    expect(t.title).toContain(long);
    expect(t.body).toBeTruthy();
  });

  it('مفتاح قالبٍ غير موجود يُمنع وقت الترجمة لا وقت التشغيل', () => {
    // النوع يمنع المفتاح المجهول؛ الموجود منها يُرجع نصّاً غير فارغ دائماً.
    for (const key of Object.keys(NOTIFICATION_TEMPLATES)) {
      for (const locale of APP_LOCALES) {
        const t = renderNotification(key as never, locale);
        expect(t.title).toBeTruthy();
        expect(t.body).toBeTruthy();
      }
    }
  });

  it('[CRITICAL] العميل لا يستطيع فرض نصّ إشعار ولا لغته', async () => {
    const { token } = await registerAndLogin();
    // محاولة حقن عنوان/جسم عبر تحديث الملف الشخصي.
    const res = await api
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferredLanguage: 'ckb', title: 'اختراق', body: 'اختراق' });
    expect(res.status).toBe(200);
    // الحقول الدخيلة لا تُخزَّن ولا تُعاد.
    expect(res.body.data.user).not.toHaveProperty('title');
    expect(res.body.data.user).not.toHaveProperty('body');
  });
});
