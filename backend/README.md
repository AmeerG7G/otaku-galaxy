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
| OTP        | مزوّد `development` (رمز ثابت `123456`) — قابل للاستبدال بمزود SMS |
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

## نماذج المسارات الرئيسية

| Method | Path                              | Access |
| ------ | --------------------------------- | ------ |
| POST   | `/api/auth/register`              | public |
| POST   | `/api/auth/verify`                | public |
| POST   | `/api/auth/login`                 | public |
| POST   | `/api/auth/reset-password`        | public |
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

- **الأوامر تُنشأ في معاملة واحدة** — تحقق مخزون → لقطات أسعار → إنشاء → تنزيل المخزون → تفريغ العربة؛ أي فشل يعيد كل شيء.
- **ليست هناك علاقة FK** بين `order_items` والمنتجات: السعر/الاسم يُلقط عند الطلب ويبقى محفوظاً حتى لو حُذف المنتج لاحقاً.
- **حالات الطلب** منضبطة بآلة حالات: `PENDING_ADMIN_CONFIRMATION → CONFIRMED → PREPARING → OUT_FOR_DELIVERY → COMPLETED` أو `REJECTED` (انظر `src/types/index.ts`).
- **حذف المنتج حذف ناعم** (`is_active = false`) للحفاظ على التواريخ.
- **رقم الهاتف** نمط عراقي `^07\d{9}$`… لا بريد إلكتروني في v1.
- رمز التحقق في وضع التطوير ثابت `123456` (مطابق لنسخة Flutter الحالية)؛ استبدل `VERIFICATION_PROVIDER` عند ربط SMS حقيقي.