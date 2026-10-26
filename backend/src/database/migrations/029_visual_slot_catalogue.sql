-- 029_visual_slot_catalogue.sql
-- فهرس الفتحات البصرية الكامل، مزروعاً ومجموعاً بمواضعه في التطبيق.
--
-- الهجرة ٠٢٨ أنشأت الآلية وتركت الفهرس فارغاً، فكان على المسؤول أن يكتب
-- مفتاح الفتحة بيده — أي أن يعرف أسماءً داخلية في كود فلاتر لا سبيل له
-- إليها. الفتحة تُزرع الآن جاهزة، فيفتح اللوحةَ ويرى كل موضع يمكنه تغييره.
--
-- [CRITICAL] الزرع لا يغيّر شيئاً في التطبيق. الفتحة بلا صور نشطة لا
-- تُرسَل أصلاً (`listPublished` يشترط صورة نشطة)، فكل شاشة تبقى تعرض رسمها
-- المضمَّن حرفياً حتى يرفع المسؤول صورة بنفسه.

ALTER TABLE visual_slots
  -- مجموعة العرض في اللوحة: منطقة التطبيق لا جدول القاعدة.
  ADD COLUMN group_key  TEXT NOT NULL DEFAULT 'other',
  -- أين يظهر هذا الرسم بالضبط، بلغة يفهمها صاحب المتجر لا باسم ملف.
  ADD COLUMN location   TEXT NOT NULL DEFAULT '',
  ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_visual_slots_group ON visual_slots (group_key, sort_order);

/**
 * الفهرس.
 *
 * كل صفّ يقابل **موضع رسم واحداً** في كود فلاتر، مستخرجاً بالمسح الكامل
 * للمشروع. القاعدة المتَّبعة في التجزئة: فتحة لكل موضع يريد صاحب المتجر
 * تغييره وحده. «شخصية تسجيل الدخول» و«شخصية إنشاء الحساب» شاشتان مختلفتان
 * عنده وإن تشابه الرسم، فلهما فتحتان.
 *
 * الاستثناءان الوحيدان — وهما موضعان مشتركان فعلاً في الكود لا في التصميم:
 *   • `auth_cta_character`: لوحة واحدة داخل `AuthScaffold` تظهر في شاشات
 *     المصادقة الأربع. تغييرها قرار واحد لا أربعة.
 *   • `guest_prompt_character`: قيمة افتراضية واحدة في `AnimeGuestPrompt`
 *     تخدم السلة والمفضلة معاً.
 *
 * المستبعَدة عمداً (لا صفوف لها): شعار المتجر، رسوم شاشة البداية، ورسم
 * شاشة انقطاع الاتصال — ثلاثتها تُعرض قبل وجود شبكة أو أثناء غيابها.
 */
INSERT INTO visual_slots (slot_key, label, location, group_key, sort_order) VALUES
  -- ── المصادقة ──
  ('login_character',            'شخصية تسجيل الدخول',      'شاشة تسجيل الدخول — ترويسة',                    'auth', 0),
  ('register_character',         'شخصية إنشاء الحساب',      'شاشة إنشاء الحساب — ترويسة',                    'auth', 1),
  ('otp_character',              'شخصية رمز التحقق',        'شاشة رمز التحقق — ترويسة',                      'auth', 2),
  ('forgot_password_character',  'شخصية استعادة كلمة المرور','شاشة استعادة كلمة المرور — ترويسة',            'auth', 3),
  ('auth_cta_character',         'شخصية لوحة المصادقة',     'اللوحة السفلية في شاشات المصادقة الأربع',        'auth', 4),
  ('guest_prompt_character',     'شخصية دعوة تسجيل الدخول', 'دعوة الدخول في السلة والمفضلة',                  'auth', 5),

  -- ── الرئيسية ──
  ('home_hero_character',            'شخصية اللوحة الرئيسية',   'الرئيسية — اللوحة العلوية الكبيرة',        'home', 0),
  ('home_promo_primary_character',   'شخصية البطاقة الترويجية الأولى', 'الرئيسية — بطاقة «موسم المدرسة»',   'home', 1),
  ('home_promo_secondary_character', 'شخصية البطاقة الترويجية الثانية','الرئيسية — بطاقة «خصومات فعّالة»',   'home', 2),
  ('home_delivery_character',        'شخصية لوحة التوصيل',      'الرئيسية — لوحة «توصيل لكل المحافظات»',      'home', 3),
  ('home_categories_backdrop',       'خلفية قسم التصنيفات',     'الرئيسية — خلفية «تسوّق حسب القسم»',         'home', 4),

  -- ── التسوّق ──
  ('empty_cart_character',              'شخصية السلة الفارغة',      'السلة — حين تكون فارغة',                 'shopping', 0),
  ('cart_checkout_character',           'شخصية زر إتمام الطلب',     'السلة — خلف زر «إتمام الطلب»',           'shopping', 1),
  ('empty_favorites_character',         'شخصية المفضلة الفارغة',    'المفضلة — حين تكون فارغة',               'shopping', 2),
  ('categories_header_character',       'شخصية ترويسة الأقسام',     'تبويب الأقسام — الترويسة',               'shopping', 3),
  ('empty_categories_character',        'شخصية لا توجد أقسام',      'تبويب الأقسام — حين لا توجد أقسام',      'shopping', 4),
  ('category_products_header_character','شخصية ترويسة منتجات القسم','شاشة منتجات القسم — الترويسة',           'shopping', 5),
  ('empty_category_products_character', 'شخصية القسم الفارغ',       'شاشة منتجات القسم — حين لا منتجات',      'shopping', 6),
  ('product_detail_character',          'شخصية تفاصيل المنتج',      'تفاصيل المنتج — الرسم العلوي',           'shopping', 7),
  ('product_detail_reviews_character',  'شخصية تقييمات المنتج',     'تفاصيل المنتج — قسم التقييمات',          'shopping', 8),

  -- ── البحث ──
  ('search_header_character', 'شخصية ترويسة البحث', 'شاشة البحث — الترويسة',        'search', 0),
  ('empty_search_character',  'شخصية لا نتائج',      'شاشة البحث — حين لا نتائج',   'search', 1),

  -- ── الطلبات ──
  ('orders_header_character',          'شخصية ترويسة الطلبات',   'شاشة الطلبات — الترويسة',            'orders', 0),
  ('empty_orders_character',           'شخصية لا طلبات',         'شاشة الطلبات — حين لا طلبات',        'orders', 1),
  ('order_success_character',          'شخصية نجاح الطلب',       'شاشة «تم إرسال الطلب»',              'orders', 2),
  ('delivery_confirmation_character',  'شخصية تأكيد الاستلام',   'نافذة تأكيد استلام الطلب',           'orders', 3),

  -- ── المكافآت ──
  ('points_character', 'شخصية نقاط المجرّة', 'شاشة نقاط المجرّة — لوحة السجل الفارغ', 'rewards', 0),

  -- ── المجتمع والتقييمات ──
  ('community_header_character',    'شخصية ترويسة المجتمع',  'شاشة المجتمع — الترويسة',            'community', 0),
  ('community_empty_character',     'شخصية المجتمع الفارغ',  'شاشة المجتمع — حين لا محتوى',        'community', 1),
  ('community_gallery_character',   'شخصية معرض المجتمع',    'شاشة المجتمع — رسم المعرض',          'community', 2),
  ('product_reviews_character',     'شخصية لوحة التقييمات',  'قسم تقييمات المنتج — اللوحة',        'community', 3),
  ('write_review_character',        'شخصية كتابة التقييم',   'شاشة كتابة التقييم',                 'community', 4),
  ('rate_order_character',          'شخصية تقييم الطلب',     'شاشة تقييم الطلب — الترويسة',        'community', 5),
  ('review_submitted_character',    'شخصية إرسال التقييم',   'شاشة «أُرسل تقييمك»',                'community', 6),

  -- ── المجموعات ──
  ('collections_tab_character',    'شخصية تبويب المجموعات', 'تبويب المجموعات — اللوحة',        'collections', 0),
  ('empty_collection_character',   'شخصية المجموعة الفارغة','تفاصيل المجموعة — حين تكون فارغة', 'collections', 1),

  -- ── الحساب والإشعارات ──
  ('account_character',                'شخصية الحساب',        'شاشة الحساب — الرسم الجانبي',   'account', 0),
  ('notifications_header_character',   'شخصية ترويسة الإشعارات','شاشة الإشعارات — الترويسة',    'account', 1),

  -- ── الترحيب والتخصيص ──
  ('onboarding_slide_one_character',   'شخصية شريحة الترحيب الأولى',  'الترحيب — الشريحة الأولى',  'onboarding', 0),
  ('onboarding_slide_two_character',   'شخصية شريحة الترحيب الثانية', 'الترحيب — الشريحة الثانية', 'onboarding', 1),
  ('onboarding_slide_three_character', 'شخصية شريحة الترحيب الثالثة', 'الترحيب — الشريحة الثالثة', 'onboarding', 2),
  ('personalize_character',            'شخصية شاشة التخصيص',          'شاشة التخصيص — الخلفية',    'onboarding', 3)
ON CONFLICT (slot_key) DO NOTHING;

-- الفتحة التجريبية من الهجرة ٠٢٨ لم تعد جزءاً من الفهرس (كان مفتاحها
-- `empty_cart`، وصار `empty_cart_character`). تُنقل صورها إن وُجدت بدل
-- إسقاطها، فلا يفقد المطوّر ما رفعه أثناء التجربة.
UPDATE visual_slot_images i
   SET slot_id = (SELECT id FROM visual_slots WHERE slot_key = 'empty_cart_character')
 WHERE i.slot_id = (SELECT id FROM visual_slots WHERE slot_key = 'empty_cart')
   AND EXISTS (SELECT 1 FROM visual_slots WHERE slot_key = 'empty_cart_character');

DELETE FROM visual_slots WHERE slot_key = 'empty_cart';
