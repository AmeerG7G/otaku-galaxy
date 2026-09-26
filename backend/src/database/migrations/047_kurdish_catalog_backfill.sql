-- 047_kurdish_catalog_backfill.sql
-- تعبئة الأعمدة الكردية التي أضافتها الهجرة 046 وبقيت فارغةً في كل صفّ.
--
-- ═══════════════ لماذا هجرة لا زرع ═══════════════
--
-- الهجرة 046 أضافت `name_ckb` وأخواتها **بلا قيمة**، والزرع لا يمسّ الصفوف
-- القائمة، فبقيت الأعمدة كلها NULL في كل بيئة (قياس التطوير: 6 أقسام،
-- 35 قسماً فرعياً، 75 منتجاً، 21 خياراً، 10 محافظات، منطقتان، 4 بنرات — صفرٌ
-- كردي في الجميع). وطبقة `localizeNamed` تسقط إلى العربية عند الفراغ، فكانت
-- الواجهة الكردية تعرض الأقسام والمنتجات عربيةً مهما اختار الزبون.
--
-- الهجرة تصل كل بيئة مرّةً واحدة؛ الزرع يعمّر البيئات الجديدة فقط. لذلك
-- القيم هنا وفي `scripts/seed.ts` واحدة — مولَّدة من مصدرٍ واحد.
--
-- ═══════════════ المبدأ ═══════════════
--
-- 1. المفتاح هو **النصّ العربي** لا المعرّف: المعرّفات UUID تختلف بين
--    البيئات، والاسم العربي `UNIQUE` (الهجرة 002) وثابت.
-- 2. `WHERE name_ckb IS NULL` دائماً: ما كتبه المسؤول من اللوحة لا يُمسّ.
-- 3. صفٌّ لا يطابق شيئاً (منتج اختبار، اسمٌ غيّره المسؤول) يبقى NULL فيسقط
--    إلى العربية — الحالة المعلنة نفسها، لا خطأ.
-- 4. القيم الرقمية والمقاسات اللاتينية ووحدة «سم» لا تُترجَم: هي نفسها في
--    الكتابتين، فقوائم `values_ckb` التي لا تحمل إلا هذه تبقى `{}` وتسقط إلى
--    القائمة العربية كاملةً (شرط 046: تطابق الطول أو الفراغ).
--
-- ⚠ الكردية (سوراني) هنا **مسوّدة تنتظر مراجعة ناطق** — بنفس حال
-- `app_strings.dart` و`notificationTemplates.ts`. المراجعة تُطبَّق من لوحة
-- التحكم أو بهجرة لاحقة، لا بتعديل هذا الملف بعد تطبيقه.

-- ═══════════════ ١ · الأقسام ═══════════════

UPDATE categories SET name_ckb = 'قرتاسیە' WHERE name = 'قرطاسية' AND name_ckb IS NULL;
UPDATE categories SET name_ckb = 'جلوبەرگ' WHERE name = 'ملابس' AND name_ckb IS NULL;
UPDATE categories SET name_ckb = 'جانتا' WHERE name = 'حقائب' AND name_ckb IS NULL;
UPDATE categories SET name_ckb = 'ئەکسسوارات' WHERE name = 'إكسسوارات' AND name_ckb IS NULL;
UPDATE categories SET name_ckb = 'فیگەر و دیاری' WHERE name = 'مجسمات وهدايا' AND name_ckb IS NULL;
UPDATE categories SET name_ckb = 'بەرهەمی جۆراوجۆری ئەنیمە' WHERE name = 'منتجات أنمي متنوعة' AND name_ckb IS NULL;

-- ═══════════════ ٢ · الأقسام الفرعية ═══════════════

-- الاسم الفرعي فريد داخل قسمه لا عالمياً، لكن الأسماء الخمسة والثلاثون هنا
-- لا تتكرّر عبر الأقسام، فالمطابقة بالاسم وحده آمنة.
UPDATE subcategories SET name_ckb = 'تیشێرت' WHERE name = 'تيشيرتات' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'هودی' WHERE name = 'هوديز' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'کڵاو' WHERE name = 'قبعات' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'گۆرەوی' WHERE name = 'جوارب' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'دەستکێش' WHERE name = 'قفازات' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'شاڵ' WHERE name = 'وشاح' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'چاوبەند بۆ خەو' WHERE name = 'غطاء عين للنوم' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'جلوبەرگی تر' WHERE name = 'ملابس أخرى' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'دەفتەر' WHERE name = 'دفاتر' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'قەڵەم' WHERE name = 'أقلام' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'ستیکەر' WHERE name = 'ملصقات' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'دەفتەر و یاداشت' WHERE name = 'دفاتر ومذكرات' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'دەفتەری وێنەکێشان' WHERE name = 'دفتر رسم' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'قەڵەمدان' WHERE name = 'محفظة مدرسية' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'ڕاستە' WHERE name = 'مساطر' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'سڕەوە' WHERE name = 'ممحاة' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'جانتای پشت' WHERE name = 'ظهرية' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'جانتای قوماش' WHERE name = 'قماشية' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'جانتای شان' WHERE name = 'حقائب كتف' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'جانتای ڕۆژانە' WHERE name = 'حقائب للطلعة / الاستخدام اليومي' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'زنجیر' WHERE name = 'سلاسل' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'ئەنگوستیلە' WHERE name = 'خواتم' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'بڕۆش' WHERE name = 'بروشات' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'زنجیری کلیل' WHERE name = 'سلاسل مفاتيح' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'بازن' WHERE name = 'أساور' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'ملوانکە' WHERE name = 'قلائد' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'مێدالیا' WHERE name = 'ميداليات' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'کاتژمێری دەست / گیرفان' WHERE name = 'ساعة يد / ساعة جيب' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'ئەکسسواراتی تر' WHERE name = 'إكسسوارات أخرى' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'بووکەڵە' WHERE name = 'دمى' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'پۆستەر' WHERE name = 'بوسترات' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'تابلۆ' WHERE name = 'لوحات' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'ماوس پاد' WHERE name = 'ماوس باد' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'ڕووپۆشی سەرین' WHERE name = 'أغطية وسائد' AND name_ckb IS NULL;
UPDATE subcategories SET name_ckb = 'کاتژمێری دیوار و مێز' WHERE name = 'ساعة حائط ومكتبية' AND name_ckb IS NULL;

-- ═══════════════ ٣ · المحافظات والمناطق ═══════════════

UPDATE governorates SET name_ckb = 'بەغدا' WHERE name = 'بغداد' AND name_ckb IS NULL;
UPDATE governorates SET name_ckb = 'بەسرە' WHERE name = 'البصرة' AND name_ckb IS NULL;
UPDATE governorates SET name_ckb = 'نەینەوا' WHERE name = 'نينوى' AND name_ckb IS NULL;
UPDATE governorates SET name_ckb = 'هەولێر' WHERE name = 'أربيل' AND name_ckb IS NULL;
UPDATE governorates SET name_ckb = 'نەجەف' WHERE name = 'النجف' AND name_ckb IS NULL;
UPDATE governorates SET name_ckb = 'کەربەلا' WHERE name = 'كربلاء' AND name_ckb IS NULL;
UPDATE governorates SET name_ckb = 'دیالە' WHERE name = 'ديالى' AND name_ckb IS NULL;
UPDATE governorates SET name_ckb = 'زیقار' WHERE name = 'ذي قار' AND name_ckb IS NULL;
UPDATE governorates SET name_ckb = 'ئەنبار' WHERE name = 'الأنبار' AND name_ckb IS NULL;
UPDATE governorates SET name_ckb = 'کوردستان' WHERE name = 'كردستان' AND name_ckb IS NULL;

UPDATE governorate_zones SET name_ckb = 'ناو قەزای نەجەف' WHERE name = 'داخل قضاء النجف' AND name_ckb IS NULL;
UPDATE governorate_zones SET name_ckb = 'دەرەوەی قەزای نەجەف' WHERE name = 'خارج قضاء النجف' AND name_ckb IS NULL;

-- ═══════════════ ٤ · خيارات المنتج ═══════════════

-- اسم المجموعة بالاسم؛ القيم بمطابقة المصفوفة العربية كاملةً حتى لا تُركَّب
-- قائمةٌ كردية على قائمةٍ عربية بطولٍ مختلف.
UPDATE product_options SET name_ckb = 'قەبارە' WHERE name = 'المقاس' AND name_ckb IS NULL;
UPDATE product_options SET name_ckb = 'قەبارە' WHERE name = 'الحجم' AND name_ckb IS NULL;
UPDATE product_options SET name_ckb = 'ڕەنگ' WHERE name = 'اللون' AND name_ckb IS NULL;
UPDATE product_options SET name_ckb = 'دیزاین' WHERE name = 'التصميم' AND name_ckb IS NULL;
UPDATE product_options SET name_ckb = 'ژمارەی لاپەڕە' WHERE name = 'عدد الأوراق' AND name_ckb IS NULL;
UPDATE product_options SET values_ckb = ARRAY['ناوەند', 'گەورە']::text[] WHERE values = ARRAY['وسط', 'كبير']::text[] AND cardinality(values_ckb) = 0;
UPDATE product_options SET values_ckb = ARRAY['ڕەش', 'سپی']::text[] WHERE values = ARRAY['أسود', 'أبيض']::text[] AND cardinality(values_ckb) = 0;
UPDATE product_options SET values_ckb = ARRAY['پێرسۆنا 1', 'پێرسۆنا 2']::text[] WHERE values = ARRAY['بيرسونا 1', 'بيرسونا 2']::text[] AND cardinality(values_ckb) = 0;

-- ═══════════════ ٥ · البنرات ═══════════════

UPDATE banners SET title_ckb = 'وەرزێکی نوێ لە جیهانی ئەنیمە' WHERE title = 'موسم جديد من عالم الأنمي' AND title_ckb IS NULL;

-- ═══════════════ ٦ · المنتجات — الكتالوج المعتمد (39) ═══════════════

-- الاسم والوصف معاً حتى لا يظهر اسمٌ كردي فوق وصفٍ عربي. المطابقة بالاسم
-- وحده تكفي: الأسماء التسعة والثلاثون مميّزة، والمكرّرات بالاسم نفسه منتجٌ واحد.
UPDATE products SET name_ckb = 'تیشێرتی ناروتۆی ڕەش', description_ckb = COALESCE(description_ckb, 'تیشێرتی لۆکە بە دیزاینی تایبەتی ناروتۆ.')
  WHERE name = 'تيشيرت ناروتو أسود' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'هودی وان پیس', description_ckb = COALESCE(description_ckb, 'هودی زستانە بە چاپی وان پیس.')
  WHERE name = 'هودي ون بيس' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'کڵاوی پیکاچو', description_ckb = COALESCE(description_ckb, 'کڵاوی کاژوەڵ بە لۆگۆی پۆکێمۆن.')
  WHERE name = 'قبعة بيكاتشو' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'دەفتەری ئەنیمە قەبارە A5', description_ckb = COALESCE(description_ckb, 'دەفتەری 100 لاپەڕە بە بەرگی ئەنیمە.')
  WHERE name = 'دفتر أنمي مقاس A5' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'قەڵەمی پۆکێمۆن', description_ckb = COALESCE(description_ckb, 'قەڵەمی جاف بە دیزاینی پۆکێمۆن.')
  WHERE name = 'قلم بوكيمون' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'ستیکەری دیواری ئەنیمە', description_ckb = COALESCE(description_ckb, 'کۆمەڵەی 10 ستیکەری جۆراوجۆر.')
  WHERE name = 'ملصقات جدارية أنمي' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'جانتای پشتی ناروتۆ', description_ckb = COALESCE(description_ckb, 'جانتای پشتی پراکتیکی بە دیزاینی ناروتۆ.')
  WHERE name = 'حقيبة ظهر ناروتو' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'جانتای قوماشی ئەنیمە', description_ckb = COALESCE(description_ckb, 'جانتای قوماشی سووک بە دیزاینی ئەنیمە.')
  WHERE name = 'حقيبة قماشية أنمي' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'زنجیری کلیلی پێرسۆنا', description_ckb = COALESCE(description_ckb, 'زنجیری کانزایی بە کوالیتی بەرز.')
  WHERE name = 'سلسلة مفاتيح بيرسونا' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'ئەنگوستیلەی زیوی ئەنیمە', description_ckb = COALESCE(description_ckb, 'ئەنگوستیلە بە دیزاینی ژاپۆنی.')
  WHERE name = 'خاتم فضة أنمي' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'بڕۆشی لۆگۆی ئەنیمە', description_ckb = COALESCE(description_ckb, 'بڕۆشی کانزایی بریسکەدار.')
  WHERE name = 'بروش شعار أنمي' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'تیشێرتی جوجوتسو کایسن', description_ckb = COALESCE(description_ckb, 'تیشێرتی لۆکە بە دیزاینی جوجوتسو.')
  WHERE name = 'تيشيرت جوجوتسو كايسن' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'هودی دیمۆن سلەیەر', description_ckb = COALESCE(description_ckb, 'هودی بە دیزاینی تانجیرۆ.')
  WHERE name = 'هودي ديمون سلاير' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'کڵاوی لوفی', description_ckb = COALESCE(description_ckb, 'کڵاوە کایە بەناوبانگەکە.')
  WHERE name = 'قبعة لوفي' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'دەفتەری سپەیستوون', description_ckb = COALESCE(description_ckb, 'دەفتەری چیرۆک و وێنە.')
  WHERE name = 'دفتر سبيستون' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'قەڵەمی ڕەنگکردنی ئەنیمە', description_ckb = COALESCE(description_ckb, 'کۆمەڵەی قەڵەمی ڕەنگکردن 12 ڕەنگ.')
  WHERE name = 'أقلام تلوين أنمي' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'جانتای پشتی جەیمس', description_ckb = COALESCE(description_ckb, 'جانتا بە دیزاینی تایبەت.')
  WHERE name = 'حقيبة ظهر جيمس' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'زنجیری نیکۆ', description_ckb = COALESCE(description_ckb, 'زنجیری ئەنیمە.')
  WHERE name = 'سلسلة نيكو' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'ئەنگوستیلەی ئۆکۆ', description_ckb = COALESCE(description_ckb, 'ئەنگوستیلەی ئەنیمەی زیوی.')
  WHERE name = 'خاتم أوكو' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'پۆستەری ئەنیمە A3', description_ckb = COALESCE(description_ckb, 'پۆستەری چاپکراو بە کوالیتی بەرز.')
  WHERE name = 'بوستر أنمي A3' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'بازنی چەرمی ئەنیمە', description_ckb = COALESCE(description_ckb, 'بازنی چەرم بە لۆگۆی ئەنیمە.')
  WHERE name = 'سوار أنمي جلدي' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'ملوانکەی کانزایی ئەنیمە', description_ckb = COALESCE(description_ckb, 'ملوانکە بە زنجیری پۆڵا.')
  WHERE name = 'قلادة أنمي معدنية' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'مێدالیای کانزایی ئەنیمە', description_ckb = COALESCE(description_ckb, 'مێدالیای مینای ڕەنگاوڕەنگ.')
  WHERE name = 'ميدالية أنمي معدنية' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'کاتژمێری دەستی ئەنیمە', description_ckb = COALESCE(description_ckb, 'کاتژمێری دەستی عەقرەبەدار بە دیزاینی ئەنیمە.')
  WHERE name = 'ساعة يد أنمي' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'دەبووسی ئەنیمە', description_ckb = COALESCE(description_ckb, 'ئەکسسوارێکی بچووکی فرەبەکارهێنان.')
  WHERE name = 'دبوس ربطة أنمي' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'دەفتەری وێنەکێشانی ئەنیمە A4', description_ckb = COALESCE(description_ckb, 'دەفتەری وێنەکێشان بە لاپەڕەی ئەستوور.')
  WHERE name = 'دفتر رسم أنمي A4' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'قەڵەمدانی ئەنیمە', description_ckb = COALESCE(description_ckb, 'قەڵەمدانی زیپدار.')
  WHERE name = 'محفظة مدرسية أنمي' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'ڕاستەی ئەنیمە 30 سم', description_ckb = COALESCE(description_ckb, 'ڕاستەی پلاستیکی شەفاف.')
  WHERE name = 'مسطرة أنمي 30 سم' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'سڕەوەی ئەنیمە', description_ckb = COALESCE(description_ckb, 'سڕەوەی نەرم بە دیزاینی کارەکتەر.')
  WHERE name = 'ممحاة أنمي' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'بووکەڵەی قەتیفەی ئەنیمە', description_ckb = COALESCE(description_ckb, 'بووکەڵەی قەتیفەی نەرم 25 سم.')
  WHERE name = 'دمية أنمي قطيفة' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'گۆرەوی لۆکەی ئەنیمە', description_ckb = COALESCE(description_ckb, 'جووتێک گۆرەوی بە دیزاینی ئەنیمە.')
  WHERE name = 'جوارب أنمي قطنية' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'دەستکێشی زستانەی ئەنیمە', description_ckb = COALESCE(description_ckb, 'دەستکێشی خوری بە دیزاینی ئەنیمە.')
  WHERE name = 'قفازات أنمي شتوية' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'شاڵی ئەنیمە', description_ckb = COALESCE(description_ckb, 'شاڵی زستانەی درێژ.')
  WHERE name = 'وشاح أنمي' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'چاوبەندی خەوی ئەنیمە', description_ckb = COALESCE(description_ckb, 'چاوبەندی نەرم بۆ گەشت و خەو.')
  WHERE name = 'غطاء عين للنوم أنمي' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'پۆستەری گەورەی ئەنیمە', description_ckb = COALESCE(description_ckb, 'پۆستەری قەبارە گەورە بە چاپی مات.')
  WHERE name = 'بوستر أنمي كبير' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'تابلۆی چوارچێوەداری ئەنیمە', description_ckb = COALESCE(description_ckb, 'تابلۆی داری چوارچێوەدار بۆ دیوار.')
  WHERE name = 'لوحة أنمي مؤطّرة' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'ماوس پادی ئەنیمە', description_ckb = COALESCE(description_ckb, 'ماوس پاد بە ڕووی نەرم و بنکەی دژە خلیسکان.')
  WHERE name = 'ماوس باد أنمي' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'ڕووپۆشی سەرینی ئەنیمە', description_ckb = COALESCE(description_ckb, 'ڕووپۆشی سەرینی لۆکە بە چاپی ئەنیمە.')
  WHERE name = 'غطاء وسادة أنمي' AND name_ckb IS NULL;
UPDATE products SET name_ckb = 'کاتژمێری دیواری ئەنیمە', description_ckb = COALESCE(description_ckb, 'کاتژمێری دیواری بێدەنگ بە دیزاینی ئەنیمە.')
  WHERE name = 'ساعة حائط أنمي' AND name_ckb IS NULL;