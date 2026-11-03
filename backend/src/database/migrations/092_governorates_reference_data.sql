-- 092_governorates_reference_data.sql
-- المحافظات الثماني عشرة ورسومها ومنطقتا النجف — بيانات تشغيلٍ لا بيانات عرض.
--
-- [CRITICAL] السبب (2026-11-03): المحافظات ورسومها لم تُنشئها أي هجرة قط؛
-- كانت في `scripts/seed.ts` وحده، وهو يزرع الكتالوج التجريبي أيضاً فلا
-- يُشغَّل على الإنتاج. قاعدة الإنتاج بُنيت من الهجرات فقط، فوصلت بلا
-- محافظات. هذه الهجرة تجعل القائمة جزءاً من سلسلة الهجرات نفسها.
--
-- الأسعار المعتمدة (المالك، 2026-11-03): بغداد 5000، والنجف بمنطقتين
-- «داخل قضاء النجف» 3000 و«خارج قضاء النجف» 4000 (الاختيار إلزامي ورسم المنطقة
-- هو المحتسب — BR-05)، وكل محافظةٍ أخرى 6000.
--
-- القواعد:
--   • لا حذف ولا إعادة إنشاء: تُضاف الناقصة باسمها، وتبقى المعرّفات القائمة.
--   • يُصحَّح الرسم المخالف للمعتمد فقط، وتُفعَّل المعطَّلة من الثماني عشرة.
--   • رسم النجف على مستوى المحافظة لا يُحتسب ما دامت لها مناطق نشطة، فلا
--     يُمسّ إن وُجد؛ ويُدرج للناقصة بـ6000 كقيمة البذرة على Staging.
--   • الكردي يُملأ حيث هو NULL فقط.
--   • الطلبات لا تُمسّ: كل طلبٍ يحمل لقطة رسمه ومنطقته (BR-82).
--   • اسمٌ قريب من اسمٍ معتمد بلا تطابقٍ حرفي (همزة، ى/ي، ة/ه، «ال»، مسافة)
--     يوقف الهجرة بخطأ بدل إنشاء نسخةٍ ثانية — يُحسم يدوياً ثم يُعاد التشغيل.
--     وكذلك منطقةٌ نشطة ثالثة للنجف (تغيّر المدى المعروض).
--   • تشغيلها مرتين لا يغيّر شيئاً.
--   • بلا جداول ولا دوال مؤقتة: لا تفترض صلاحية TEMPORARY على القاعدة.

DO $$
DECLARE
  -- الاسم، الكردي، الرسم المعتمد (NULL = لا رسم مسطّح: النجف)، رسم الإدراج.
  approved CONSTANT JSONB := '[
    ["بغداد",      "بەغدا",     5000, 5000],
    ["البصرة",     "بەسرە",     6000, 6000],
    ["نينوى",      "نەینەوا",   6000, 6000],
    ["أربيل",      "هەولێر",    6000, 6000],
    ["السليمانية", "سلێمانی",   6000, 6000],
    ["دهوك",       "دهۆک",      6000, 6000],
    ["كركوك",      "کەرکووک",   6000, 6000],
    ["الأنبار",    "ئەنبار",    6000, 6000],
    ["ديالى",      "دیالە",     6000, 6000],
    ["بابل",       "بابل",      6000, 6000],
    ["كربلاء",     "کەربەلا",   6000, 6000],
    ["النجف",      "نەجەف",     null, 6000],
    ["واسط",       "واسیت",     6000, 6000],
    ["صلاح الدين", "سەڵاحەدین", 6000, 6000],
    ["القادسية",   "قادسیە",    6000, 6000],
    ["المثنى",     "مەسەنا",    6000, 6000],
    ["ذي قار",     "زیقار",     6000, 6000],
    ["ميسان",      "مێسان",     6000, 6000]
  ]';
  najaf_zones CONSTANT JSONB := '[
    ["داخل قضاء النجف", "ناو قەزای نەجەف",      3000, 0],
    ["خارج قضاء النجف", "دەرەوەی قەزای نەجەف", 4000, 1]
  ]';
  conflicts TEXT;
  najaf_id UUID;
BEGIN
  -- ═══ ١ · الحارس ═══
  -- مفتاح المقارنة: همزات الألف ألفاً، ى ياءً، ة هاءً، بلا تطويل ولا مسافات ولا «ال» أولى.
  WITH a AS (SELECT e->>0 AS name FROM jsonb_array_elements(approved) e)
  SELECT string_agg(format('%s ≈ %s', a.name, g.name), '; ' ORDER BY a.name, g.name)
    INTO conflicts
    FROM a JOIN governorates g
      ON regexp_replace(regexp_replace(translate(g.name, 'أإآٱىةـ', 'اااايه'), '\s+', '', 'g'), '^ال', '')
       = regexp_replace(regexp_replace(translate(a.name, 'أإآٱىةـ', 'اااايه'), '\s+', '', 'g'), '^ال', '')
   WHERE g.name <> a.name;
  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION '092 refused: governorate names differ only in spelling: %', conflicts;
  END IF;

  SELECT id INTO najaf_id FROM governorates WHERE name = 'النجف';
  IF najaf_id IS NOT NULL THEN
    WITH a AS (SELECT e->>0 AS name FROM jsonb_array_elements(najaf_zones) e)
    SELECT string_agg(format('%s ≈ %s', a.name, z.name), '; ' ORDER BY a.name, z.name)
      INTO conflicts
      FROM a JOIN governorate_zones z
        ON z.governorate_id = najaf_id
       AND regexp_replace(regexp_replace(translate(z.name, 'أإآٱىةـ', 'اااايه'), '\s+', '', 'g'), '^ال', '')
         = regexp_replace(regexp_replace(translate(a.name, 'أإآٱىةـ', 'اااايه'), '\s+', '', 'g'), '^ال', '')
     WHERE z.name <> a.name;
    IF conflicts IS NOT NULL THEN
      RAISE EXCEPTION '092 refused: Najaf zone names differ only in spelling: %', conflicts;
    END IF;

    SELECT string_agg(z.name, '; ' ORDER BY z.name)
      INTO conflicts
      FROM governorate_zones z
     WHERE z.governorate_id = najaf_id AND z.is_active
       AND z.name NOT IN (SELECT e->>0 FROM jsonb_array_elements(najaf_zones) e);
    IF conflicts IS NOT NULL THEN
      RAISE EXCEPTION '092 refused: Najaf has other active zones: %', conflicts;
    END IF;
  END IF;

  -- ═══ ٢ · المحافظات ═══
  INSERT INTO governorates (name, name_ckb, delivery_fee, is_active)
  SELECT e->>0, e->>1, (e->>3)::numeric, TRUE FROM jsonb_array_elements(approved) e
  ON CONFLICT (name) DO NOTHING;

  UPDATE governorates g
     SET delivery_fee = (e->>2)::numeric
    FROM jsonb_array_elements(approved) e
   WHERE g.name = e->>0 AND e->>2 IS NOT NULL AND g.delivery_fee <> (e->>2)::numeric;

  UPDATE governorates g
     SET is_active = TRUE
    FROM jsonb_array_elements(approved) e
   WHERE g.name = e->>0 AND NOT g.is_active;

  UPDATE governorates g
     SET name_ckb = e->>1
    FROM jsonb_array_elements(approved) e
   WHERE g.name = e->>0 AND g.name_ckb IS NULL;

  -- ═══ ٣ · منطقتا النجف ═══
  SELECT id INTO STRICT najaf_id FROM governorates WHERE name = 'النجف';

  INSERT INTO governorate_zones (governorate_id, name, name_ckb, delivery_fee, sort_order, is_active)
  SELECT najaf_id, e->>0, e->>1, (e->>2)::numeric, (e->>3)::int, TRUE
    FROM jsonb_array_elements(najaf_zones) e
  ON CONFLICT (governorate_id, name) DO NOTHING;

  UPDATE governorate_zones z
     SET delivery_fee = (e->>2)::numeric
    FROM jsonb_array_elements(najaf_zones) e
   WHERE z.governorate_id = najaf_id AND z.name = e->>0 AND z.delivery_fee <> (e->>2)::numeric;

  UPDATE governorate_zones z
     SET is_active = TRUE
    FROM jsonb_array_elements(najaf_zones) e
   WHERE z.governorate_id = najaf_id AND z.name = e->>0 AND NOT z.is_active;

  UPDATE governorate_zones z
     SET name_ckb = e->>1
    FROM jsonb_array_elements(najaf_zones) e
   WHERE z.governorate_id = najaf_id AND z.name = e->>0 AND z.name_ckb IS NULL;
END
$$;
