# ⭐ Majarat Al-Otaku (مجرات الاوتاكو) — API

Backend Node.js + TypeScript + Express 5 + PostgreSQL لهذا المتجر الأنمي،
بواجهة واحدة مشتركة بين تطبيق Flutter ولوحة تحكم React مستقبلية.

## Stack

| Layer      | Choice                          |
| ---------- | ------------------------------- |
| Runtime    | Node 20+ / TypeScript (NodeNext ESM) |
| Framework  | Express 5 (async errors تلقائي) |
| Database   | PostgreSQL 16 — SQL خام عبر `pg` |
| Validation | Zod 4                          |
| Auth       | JWT (access 7d) + bcryptjs     |
| Accounts   | طلباتٌ تحسمها الإدارة من اللوحة بعد تحقّق واتساب — **لا SMS ولا OTP** |
| Security   | helmet, cors, express-rate-limit |
| Tests      | vitest + supertest             |

## المتطلبات

- Node.js ≥ 20 (نُصيح v24.19.0)
- PostgreSQL 16 محلياً يعمل على `localhost:5432`

## الإعداد

1. إنشاء المستخدم وقاعدة البيانات (مرة واحدة) — بأمر من المسؤول المحلي:

   ```sql
   CREATE ROLE otaku_galaxy_app LOGIN PASSWORD 'تختارها';
   CREATE DATABASE otaku_galaxy OWNER otaku_galaxy_app;
   CREATE DATABASE otaku_galaxy_test OWNER otaku_galaxy_app;
   ```

2. إعداد المتغيرات:

   ```bash
   cp .env.example .env   # عدّل JWT_SECRET وكلمة النحور DATABASE_URL
   ```

3. تثبيت الاعتماديات وتشغيل:

   ```bash
   npm install
   npm run db:migrate    # تطبيق مهاجرات قاعدة البيانات
   npm run db:seed       # بيانات تجريبية (أقسام، منتجات، محافظات، أدمن)
   npm run dev           # http://localhost:4000
   ```

تسجيل الدخول الإداري التجريبي: `07700000000` / `admin123`

## الأوامر

| Script          | Description                        |
| --------------- | ---------------------------------- |
| `npm run dev`   | تشغيل تطويري مع إعادة تحميل تلقائية |
| `npm run build` | بناء TypeScript → `dist/`          |
| `npm run typecheck` | فحص الأنواع فقط                  |
| `npm run test`  | اختبارات API على قاعدة اختبار      |
| `npm run db:migrate` | تطبيق المهاجرات               |
| `npm run db:seed` | تعبئة بيانات تجريبية            |
| `npm run db:reset` | مسح وإعادة بناء المخطط (تطوير) |

## هيكل المشروع

```
backend/
├── scripts/          # migrate.ts, seed.ts
├── src/
│   ├── config/       # قراءة إعدادات البيئة
│   ├── controllers/  # طبقة HTTP الرفيعة
│   ├── database/     # pool + migrations SQL
│   ├── middleware/   # auth, admin, error handler, rate limit
│   ├── repositories/ # وصول SQL خام
│   ├── routes/       # تعريف المسارات
│   ├── services/     # منطق الأعمال (معاملات الطلبات…)
│   ├── types/        # أنواع مشتركة
│   ├── utils/        # أخطاء، ردود، Zod
│   └── validators/   # مخططات Zod
└── tests/            # vitest + supertest (قاعدة _test)
```

## تنسيق الردود

نجاح: `{ success: true, data, message? }`
خطأ:  `{ success: false, data: null, message, error: { code } }`

أخطاء القاعدة التي هي رفضٌ للمدخلات لا عطلٌ تُترجَم مركزياً في
`middleware/error-handler.ts` (`pgErrorToAppError`) بدل ٥٠٠: تفرّدٌ مكرّر →
`409 DUPLICATE_VALUE`، مفتاح أجنبي غائب → `404 RELATED_NOT_FOUND` أو حذفٌ تمنعه
بيانات مرتبطة → `409 HAS_DEPENDENTS`، قيدُ فحص/معرّف فاسد → `400 INVALID_VALUE`،
فيض رقمي → `400 VALUE_OUT_OF_RANGE`، نصّ أطول من العمود → `400 VALUE_TOO_LONG`.
الجمود والانقطاع والصياغة تبقى `500 INTERNAL_ERROR`. المدقّقات والخدمات تبقى
المصدر الأول للرسائل الدقيقة؛ هذه شبكة أمان.

## نماذج المسارات الرئيسية

| Method | Path                              | Access |
| ------ | --------------------------------- | ------ |
| POST   | `/api/auth/register`              | public — ينشئ طلب تسجيل (202)، لا جلسة |
| POST   | `/api/auth/login`                 | public — يرفض غير المفعَّل `ACCOUNT_PENDING_APPROVAL` |
| POST   | `/api/auth/forgot-password`       | public — ينشئ طلب إعادة تعيين (202)، لا رمز |
| PATCH  | `/api/auth/me/password`           | customer — تغيير اختياري بكلمة المرور الحالية |
| GET    | `/api/admin/account-requests`     | admin |
| POST   | `/api/admin/account-requests/:id/approve` | admin — تسجيل فقط: يفعّل الحساب |
| POST   | `/api/admin/account-requests/:id/reject`  | admin — يبقى في السجل |
| GET    | `/api/admin/customers/:id`        | admin — الملفّ الكامل بلا أسرار |
| PATCH  | `/api/admin/customers/:id/password` | admin — كلمة مرور جديدة **دائمة** |
| GET    | `/api/catalog/home`               | public |
| GET    | `/api/catalog/products?page&limit&categoryId&subcategoryId` | public |
| GET    | `/api/catalog/products/search?q`  | public |
| GET    | `/api/products/:id`               | — |
| GET    | `/api/favorites` / `/api/cart`    | customer |
| POST   | `/api/orders`                     | customer |
| GET    | `/api/orders`                     | customer |
| PATCH  | `/api/admin/orders/:id/status`    | admin |
| POST   | `/api/admin/products`             | admin |
| ...    | (أقسام، بنرات، محافظات، مستخدمون)  | admin |

## ملاحظات تصميم مهمة

- **الأوامر تُنشأ في معاملة واحدة** — قفل العربة → بوّابة المخزون (هل يجوز طلب هذه الكمية الآن؟) → لقطات أسعار → إنشاء → تفريغ العربة؛ أي فشل يعيد كل شيء. **لا تنزيل مخزون عند الإرسال.**
- **المخزون يُستهلك عند قبول الإدارة وحده** (قرار عمل 2026-09-14) — معاملة واحدة: قفل صفّ الطلب، قفل صفوف المنتجات بترتيب ثابت، قراءة المخزون الحالي، تنزيلٌ كامل أو `409 INSUFFICIENT_STOCK` والطلب يبقى منتظراً. رفضُ المنتظر لا يمسّ المخزون؛ رفضُ ما قُبل يُرجعه مرةً واحدة. الهجرة `051` تسوّي المنتظر القديم، وسكربت `scripts/oversell-multi-instance.ts` يثبت الحماية عبر عمليتين.
- **ليست هناك علاقة FK** بين `order_items` والمنتجات: السعر/الاسم يُلقط عند الطلب ويبقى محفوظاً حتى لو حُذف المنتج لاحقاً.
- **حالات الطلب** منضبطة بآلة حالات: `PENDING_ADMIN_CONFIRMATION → CONFIRMED → PREPARING → OUT_FOR_DELIVERY → COMPLETED` أو `REJECTED` (انظر `src/types/index.ts`).
- **حذف المنتج حذف ناعم** (`is_active = false`) للحفاظ على التواريخ.
- **رقم الهاتف** نمط عراقي `^07\d{9}$`… لا بريد إلكتروني في v1.
- **لا رمز تحقق**: إنشاء الحساب ونسيان كلمة المرور طلبان (`account_requests`) تحسمهما الإدارة يدوياً بعد تحقّق واتساب. الكلمة التي يضعها المسؤول دائمة — لا مؤقّتة ولا `must_change_password`. الشيفرة القديمة محفوظة في `legacy/otp/` خارج البناء.