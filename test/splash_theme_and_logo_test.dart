// شاشة البداية تتبع المظهر، وشعارُها العلامةُ المربّعة بأرضيتها.
//
// [CRITICAL] العطب: شاشة البداية كانت فاتحةً في الوضعين معاً — تدرّجها
// وألوان نصّها وهالتها ومسار تحميلها كلها ثوابت مضبوطة لخلفية فاتحة. فكان
// مستخدم الوضع الداكن يُقذف من واجهةٍ داكنة إلى شاشةٍ فاتحة ثم يعود، وتظهر
// الهالة **البيضاء** قرصاً أبيض خلف شعارٍ شفّاف — وهو ما يُقرأ «شعار
// بخلفية».

import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/features/splash/presentation/widgets/splash_backdrop.dart';
import 'package:otaku_galaxy/features/splash/presentation/widgets/splash_brand.dart';
import 'package:otaku_galaxy/features/splash/presentation/widgets/splash_loader.dart';

/// إضاءة نسبية تقريبية للحكم على «فاتح» و«داكن».
double _luminance(Color c) => c.computeLuminance();

Widget _host(ThemeData theme, Widget child) => MaterialApp(
      theme: theme,
      locale: const Locale('ar'),
      localizationsDelegates: const [
        DefaultMaterialLocalizations.delegate,
        DefaultWidgetsLocalizations.delegate,
      ],
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: Stack(children: [child])),
      ),
    );

void main() {
  group('[CRITICAL] تدرّج شاشة البداية يتبع المظهر', () {
    testWidgets('الوضع الفاتح يستعمل التدرّج الفاتح', (tester) async {
      await tester.pumpWidget(_host(AppTheme.light, const SplashBackdrop()));
      await tester.pump();
      final box = tester.widget<DecoratedBox>(
        find.descendant(
          of: find.byType(SplashBackdrop),
          matching: find.byType(DecoratedBox),
        ).first,
      );
      final g = (box.decoration as BoxDecoration).gradient! as LinearGradient;
      expect(g.colors, SplashBackdrop.gradient.colors);
      expect(_luminance(g.colors.first), greaterThan(0.5), reason: 'فاتح فعلاً');
    });

    testWidgets('[CRITICAL] الوضع الداكن يستعمل التدرّج الداكن', (tester) async {
      await tester.pumpWidget(_host(AppTheme.dark, const SplashBackdrop()));
      await tester.pump();
      final box = tester.widget<DecoratedBox>(
        find.descendant(
          of: find.byType(SplashBackdrop),
          matching: find.byType(DecoratedBox),
        ).first,
      );
      final g = (box.decoration as BoxDecoration).gradient! as LinearGradient;
      expect(g.colors, SplashBackdrop.darkGradient.colors);
      expect(_luminance(g.colors.first), lessThan(0.1),
          reason: 'لا خلفية فاتحة في الوضع الداكن');
    });

    test('التدرّجان ليسا نسخةً واحدة', () {
      expect(SplashBackdrop.darkGradient.colors,
          isNot(SplashBackdrop.gradient.colors));
    });
  });

  group('[CRITICAL] لا هالة بيضاء خلف الشعار في الوضع الداكن', () {
    Future<RadialGradient> haloOf(WidgetTester tester, ThemeData theme) async {
      final c = AnimationController(
        vsync: const TestVSync(), duration: const Duration(seconds: 1))..value = 1;
      addTearDown(c.dispose);
      await tester.pumpWidget(_host(theme, SplashBrand(
        popOpacity: c, popScale: c, pulseOpacity: c, pulseScale: c)));
      await tester.pump();
      final box = tester.widgetList<DecoratedBox>(
        find.descendant(
          of: find.byType(SplashBrand), matching: find.byType(DecoratedBox)),
      ).firstWhere((d) =>
          (d.decoration as BoxDecoration).gradient is RadialGradient);
      return (box.decoration as BoxDecoration).gradient! as RadialGradient;
    }

    testWidgets('الفاتح: الهالة بيضاء كما في المرجع', (tester) async {
      final g = await haloOf(tester, AppTheme.light);
      expect(_luminance(g.colors.first), greaterThan(0.9));
    });

    testWidgets('[CRITICAL] الداكن: الهالة ليست بيضاء', (tester) async {
      final g = await haloOf(tester, AppTheme.dark);
      expect(_luminance(g.colors.first), lessThan(0.6),
          reason: 'قرص أبيض خلف شعار شفّاف = «شعار بخلفية»');
    });

    testWidgets('[CRITICAL] الشعار يبقى مقروءاً فوق الهالة عند ذروة النبض',
        (tester) async {
      // العمل الفني بنفسجي متوسّط؛ هالةٌ بنفسجية ساطعة تبتلعه. القياس على
      // أسوأ لحظة (أعلى شدّة نبض) لا على المتوسّط.
      final g = await haloOf(tester, AppTheme.dark);
      const logoLum = 0.1668; // إضاءة #A35BBF النسبية المقيسة من الأصل
      final haloOnBg = Color.alphaBlend(
        g.colors.first.withValues(alpha: g.colors.first.a * 0.9),
        const Color(0xFF141024),
      );
      final hl = haloOnBg.computeLuminance();
      final contrast =
          (logoLum > hl ? (logoLum + 0.05) / (hl + 0.05) : (hl + 0.05) / (logoLum + 0.05));
      expect(contrast, greaterThanOrEqualTo(3.0),
          reason: 'الشعار يذوب في هالته — قياس ${contrast.toStringAsFixed(2)}:1');
    });

    testWidgets('الهالة تتلاشى إلى شفافية تامة في الوضعين', (tester) async {
      for (final theme in [AppTheme.light, AppTheme.dark]) {
        final g = await haloOf(tester, theme);
        expect(g.colors.last.a, 0.0);
      }
    });
  });

  group('شريط التحميل يتبع المظهر', () {
    // [NOTE] اختبارٌ لكل مظهر على حدة لا حلقةٌ بـ`pumpWidget` مرتين: إعادة
    // الضخّ على شجرةٍ من النوع نفسه تُعيد استعمال العناصر، فيُقرأ المظهر
    // الأول في المرّتين ويمرّ الاختبار على وهم.
    Future<Color> trackColor(WidgetTester tester, ThemeData theme) async {
      final c = AnimationController(
        vsync: const TestVSync(), duration: const Duration(seconds: 1))..value = 0.5;
      addTearDown(c.dispose);
      await tester.pumpWidget(_host(theme, SplashLoader(loadFill: c)));
      await tester.pump();
      final track = tester.widgetList<Container>(
        find.descendant(
          of: find.byType(SplashLoader), matching: find.byType(Container)),
      ).firstWhere((w) =>
          w.decoration is BoxDecoration &&
          (w.decoration! as BoxDecoration).color != null);
      return (track.decoration! as BoxDecoration).color!;
    }

    testWidgets('الفاتح: مسار داكن خافت على خلفية فاتحة', (tester) async {
      final c = await trackColor(tester, AppTheme.light);
      expect(_luminance(c), lessThan(0.5));
    });

    testWidgets('[CRITICAL] الداكن: مسار فاتح خافت على خلفية داكنة', (tester) async {
      final c = await trackColor(tester, AppTheme.dark);
      expect(_luminance(c), greaterThan(0.5),
          reason: 'مسارٌ داكن على خلفية داكنة يذوب فلا يُرى');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // [TRIPWIRE] الشعار = العلامة المربّعة بأرضيتها، لا العلامة الشفّافة.
  //
  // هذه المجموعة كانت تفرض العكس تماماً: «شعار المتجر شفّاف — لا خلفية
  // مخبوزة»، وهو قرار المرحلة ١٢ حين كان الأصل السابق JPEG يجرّ خلفيةً
  // عرَضية. القرار تبدّل بطلبٍ صريح: الأصل المعتمد الآن هو «التهيئة
  // الرسمية أ» في قفل المرحلة ٠١ — `masters/otaku-square-mark.svg`،
  // العلامة وحدها على أرضيتها المعتمدة وبلا نصّ.
  //
  // فُرِض العكس ولم يُحذف الحارس: الشفافية كانت تُقاس بالبكسل، وكذلك
  // الأرضية تُقاس بالبكسل الآن. الغرض أن تسقط الإعادةُ الصامتة للأصل
  // الشفّاف — لا أن يُصدَّق الاسم.
  // ═══════════════════════════════════════════════════════════════════
  group('[TRIPWIRE] شعار المتجر بأرضيته — لا عودة للأصل الشفّاف', () {
    const asset = 'assets/branding/otaku-square-mark.png';

    /// يقرأ الأصل بكسلاً بكسلاً: (العرض، الارتفاع، ألفا، إضاءة).
    Future<(int, int, int Function(int, int), double Function(int, int))>
        readAsset() async {
      final codec = await ui.instantiateImageCodec(
        await File(asset).readAsBytes(),
      );
      final frame = await codec.getNextFrame();
      final data = await frame.image.toByteData(
        format: ui.ImageByteFormat.rawRgba,
      );
      final w = frame.image.width, h = frame.image.height;
      int at(int x, int y, int c) => data!.getUint8((y * w + x) * 4 + c);
      double lum(int x, int y) =>
          0.2126 * at(x, y, 0) + 0.7152 * at(x, y, 1) + 0.0722 * at(x, y, 2);
      return (w, h, (x, y) => at(x, y, 3), lum);
    }

    test('المكوّن المشترك يشير إلى الأصل المربّع وحده', () {
      final src = File(
        'lib/core/design_system/components/branding/otaku_store_logo.dart',
      ).readAsStringSync();
      expect(src, contains(asset));
      // العودة الصامتة إلى الأصل الشفّاف — الاسم القديم لا يُذكر إطلاقاً.
      expect(src, isNot(contains('otaku-mark.png')),
          reason: 'الأصل الشفّاف عاد إلى المكوّن المشترك');
      expect(src, isNot(contains('.jpg')));
      expect(src, isNot(contains('.jpeg')));
    });

    test('[TRIPWIRE] الملف نفسه معتمٌ بالكامل — الأرضية مخبوزة فعلاً',
        () async {
      // لا يُوثق بالاسم: تُقرأ البكسلات.
      final (w, h, alphaAt, _) = await readAsset();

      for (final p in [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) {
        expect(alphaAt(p[0], p[1]), 255,
            reason: 'الزاوية (${p[0]},${p[1]}) شفافة ⇒ عاد الأصل بلا أرضية');
      }
      // ولا بكسل شفّاف واحد في البلاطة كلها.
      var transparent = 0;
      for (var y = 0; y < h; y += 2) {
        for (var x = 0; x < w; x += 2) {
          if (alphaAt(x, y) != 255) transparent++;
        }
      }
      expect(transparent, 0,
          reason: '$transparent بكسلاً غير معتم ⇒ ليست البلاطة المربّعة');
    });

    test('[TRIPWIRE] بلا نصّ — العلامة «أ» لا القفلة «ب»', () async {
      // القفلة (`otaku-square-lockup.svg`) تضع «مجرة الأوتاكو» بلون فاتح
      // (#EDEAF6) في الشريط ٠٫٨١–٠٫٨٤٥ من ارتفاع البلاطة. حبر العلامة
      // المربّعة ينتهي عند ٠٫٧٩، فذلك الشريط أرضيةٌ خالصة عندها.
      // قياساً: العلامة ١٧٫٩ · القفلة ٢٣٥٫٥ — والعتبة بينهما.
      final (w, h, _, lumAt) = await readAsset();
      var brightest = 0.0;
      for (var y = (h * 0.81).round(); y < (h * 0.845).round(); y++) {
        for (var x = 0; x < w; x++) {
          if (lumAt(x, y) > brightest) brightest = lumAt(x, y);
        }
      }
      expect(brightest, lessThan(120),
          reason: 'إضاءة ${brightest.toStringAsFixed(1)} في شريط الكلمة '
              '⇒ رُكِّبت القفلة ذات النصّ بدل العلامة وحدها');
    });

    test('مربّعٌ ١:١ بدقّة تكفي أكبر مقاس (١٢٤ منطقياً)', () async {
      final (w, h, _, _) = await readAsset();
      expect(w, h, reason: 'ليس مربّعاً ⇒ `BoxFit.contain` سيترك فراغاً');
      expect(w, greaterThanOrEqualTo(496),
          reason: '١٢٤ منطقياً × ٤ كثافة = ٤٩٦ — أقلّ من ذلك يظهر ناعماً');
    });

    // المرسوم لا الملف: الأصل قد يكون سليماً ويفسده `BoxFit.cover` أو
    // `ClipOval` في المكوّن — وكلاهما كان موجوداً في هذا الملف قبل
    // المرحلة ١٢. هذا الاختبار يقيس ما يخرج من الرسم فعلاً.
    //
    // [2026-09-14] العقد الآن: مربّعٌ، معتمٌ **إلا** أربعة أقواس في الزوايا
    // بنصف قطر `AppDimens.logoCornerRatio × size` (قصٌّ على مستوى العرض؛
    // الأصل نفسه بلا تغيير). ما يُحرس: الزاوية الحادّة شفّافة، وما بعد القوس
    // مباشرةً أرضيةُ العلامة الداكنة، ولا شفافية خارج مربّعات الزوايا،
    // والعمل الفني في الوسط لم يُمَسّ. الدائرة (`ClipOval`) و`BoxFit.cover`
    // ما زالا يسقطان هنا: الأولى تُشفِّف ما بعد القوس، والثانية تغيّر الوسط.
    for (final s in <double>[36, 46, 124]) {
      testWidgets('[TRIPWIRE] المرسوم عند $s: مربّع، معتم، بزوايا مستديرة نسبية',
          (tester) async {
        final key = GlobalKey();
        await tester.pumpWidget(_host(
          AppTheme.light,
          Center(
            child: RepaintBoundary(key: key, child: OtakuStoreLogo(size: s)),
          ),
        ));
        await tester.runAsync(() async {
          await precacheImage(
            const AssetImage(asset),
            find.byType(OtakuStoreLogo).evaluate().single,
          );
        });
        await tester.pump();
        await tester.pump();

        expect(tester.getSize(find.byType(OtakuStoreLogo)), Size(s, s),
            reason: 'الصندوق ليس مربّعاً ⇒ تمطيط');

        // [CRITICAL] `toImage` و`toByteData` داخل `runAsync` واحد.
        // فصلُهما يجمّد الاختبار بلا رسالة بدل أن يسقط.
        final boundary =
            key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
        late ByteData? data;
        late int w, h;
        await tester.runAsync(() async {
          final img = await boundary.toImage(pixelRatio: 3);
          data = await img.toByteData(format: ui.ImageByteFormat.rawRgba);
          w = img.width;
          h = img.height;
        });
        int at(int x, int y, int c) => data!.getUint8((y * w + x) * 4 + c);

        expect(w, h, reason: 'الرسم ليس مربّعاً ⇒ نسبة أبعاد خاطئة');

        // نصف القطر بالبكسل المرسوم (كثافة ٣).
        final r = (s * AppDimens.logoCornerRatio * 3).round();
        expect(r, greaterThan(0));
        expect(r, lessThan(w ~/ 4), reason: 'استدارة تقارب الدائرة');

        double lum(int x, int y) =>
            0.2126 * at(x, y, 0) + 0.7152 * at(x, y, 1) + 0.0722 * at(x, y, 2);
        // هامش بكسلٍ واحد لتنعيم الحواف (`Clip.antiAlias`) على حدّ المربّع.
        final rr = r + 1;
        bool insideCornerSquare(int x, int y) =>
            (x < rr || x >= w - rr) && (y < rr || y >= h - rr);

        // ١) لا شفافية إلّا داخل مربّعات الزوايا الأربعة.
        var translucentOutside = 0;
        for (var y = 0; y < h; y++) {
          for (var x = 0; x < w; x++) {
            if (at(x, y, 3) != 255 && !insideCornerSquare(x, y)) {
              translucentOutside++;
            }
          }
        }
        expect(translucentOutside, 0,
            reason: '$translucentOutside بكسلاً شفّافاً خارج الزوايا '
                '⇒ عاد الأصل الشفّاف أو قُصَّ أكثر من الزوايا (ClipOval؟)');

        // ٢) الزاوية الحادّة نفسها شفّافة — الاستدارة موجودة.
        for (final p in [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) {
          expect(at(p[0], p[1], 3), 0,
              reason: 'الزاوية (${p[0]},${p[1]}) معتمة ⇒ لا استدارة');
        }

        // ٣) ما بعد القوس مباشرةً (على القطر) معتمٌ وأرضيةُ العلامة الداكنة:
        //    نقطةٌ على قطر الزاوية عند ٠٫٦r من كل ضلع — داخل الشكل المستدير
        //    (المسافة إلى مركز القوس ≈ ٠٫٥٧r < r) وخارج المنطقة الآمنة للعمل.
        final inset = (r * 0.6).round();
        for (final p in [
          [inset, inset],
          [w - 1 - inset, inset],
          [inset, h - 1 - inset],
          [w - 1 - inset, h - 1 - inset],
        ]) {
          expect(at(p[0], p[1], 3), 255,
              reason: 'بعد القوس (${p[0]},${p[1]}) شفّاف ⇒ قصٌّ أوسع من المعلَن');
          expect(lum(p[0], p[1]), lessThan(40),
              reason: 'بعد القوس (${p[0]},${p[1]}) ليس أرضية العلامة ⇒ '
                  'BoxFit.cover أو أصلٌ آخر');
        }

        // ٤) الوسط عملٌ فنيٌّ مضيء لم يُمسّ (البلاطة الوردية العلوية للعلامة).
        var brightCentre = 0;
        for (var y = h ~/ 4; y < 3 * h ~/ 4; y++) {
          for (var x = w ~/ 4; x < 3 * w ~/ 4; x++) {
            if (lum(x, y) > 120) brightCentre++;
          }
        }
        expect(brightCentre, greaterThan((w * h) ~/ 100),
            reason: 'الوسط داكن كله ⇒ العمل الفني قُصَّ أو استُبدل');
      });
    }

    test('لا أصل شعار ثانٍ مكرّر', () {
      final files = Directory('assets/branding')
          .listSync()
          .whereType<File>()
          .map((f) => f.path.split('/').last)
          .toList();
      expect(files, ['otaku-square-mark.png']);
    });

    test('pubspec يشحن الأصل المربّع لا الشفّاف', () {
      final pubspec = File('pubspec.yaml').readAsStringSync();
      expect(pubspec, contains(asset));
      expect(pubspec, isNot(contains('assets/branding/otaku-mark.png')),
          reason: 'الأصل الشفّاف ما زال يُشحن مع التطبيق');
    });
  });
}
