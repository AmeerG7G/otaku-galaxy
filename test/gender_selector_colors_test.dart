// ألوان اختيار الجنس — الذكر أزرق والأنثى أحمر.
//
// [CRITICAL] اللونان من الرموز الدلالية (`info` و`error`) لا من قيمتين
// مكتوبتين في الودجة: قيمةٌ مكتوبة كانت ستبقى على حالها في الوضع الداكن حيث
// تتغيّر لوحة النظام كلها. هذه الاختبارات تقارن بالرمز لا بسداسيّ ثابت.
//
// وكلا الشاشتين — التسجيل والإعدادات — تستعملان `GenderSelector` نفسه، فلا
// موضع ثانٍ لهذا المنطق يتباعد عنه.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/gender.dart';

/// يبني الشاشة بحالة اختيار معطاة، في الوضع المطلوب.
Future<void> _pump(
  WidgetTester tester, {
  AppGender? value,
  ThemeData? theme,
  TextDirection direction = TextDirection.rtl,
  Size size = const Size(390, 844),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      theme: theme ?? AppTheme.light,
      home: Directionality(
        textDirection: direction,
        child: Scaffold(
          body: GenderSelector(value: value, onChanged: (_) {}),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// حافة بطاقة الخيار المعنون بـ[label].
BoxBorder? _borderOf(WidgetTester tester, String label) {
  final container = tester.widget<AnimatedContainer>(
    find.ancestor(
      of: find.text(label),
      matching: find.byType(AnimatedContainer),
    ),
  );
  return (container.decoration as BoxDecoration?)?.border;
}

Color? _borderColor(WidgetTester tester, String label) =>
    (_borderOf(tester, label) as Border?)?.top.color;

double? _borderWidth(WidgetTester tester, String label) =>
    (_borderOf(tester, label) as Border?)?.top.width;

/// لون أيقونة بطاقة الخيار المعنون بـ[label].
Color? _iconColor(WidgetTester tester, String label) {
  final icon = tester.widget<Icon>(
    find.descendant(
      of: find.ancestor(
        of: find.text(label),
        matching: find.byType(AnimatedContainer),
      ),
      matching: find.byType(Icon),
    ),
  );
  return icon.color;
}

/// الرموز الدلالية للوضع المطلوب — نفس ما تقرأه الودجة.
AppThemeColors _colorsOf(ThemeData theme) =>
    theme.extension<AppThemeColors>()!;

void main() {
  group('اختيار الذكر', () {
    testWidgets('[CRITICAL] الحافة والأيقونة بالأزرق الدلالي', (tester) async {
      await _pump(tester, value: AppGender.male);
      final blue = _colorsOf(AppTheme.light).info;

      expect(_borderColor(tester, GenderedStrings.male), blue);
      expect(_iconColor(tester, GenderedStrings.male), blue);
    });

    testWidgets('الخيار الآخر يبقى محايداً', (tester) async {
      await _pump(tester, value: AppGender.male);
      final red = _colorsOf(AppTheme.light).error;

      expect(_borderColor(tester, GenderedStrings.female), isNot(red));
      expect(_iconColor(tester, GenderedStrings.female), isNot(red));
    });
  });

  group('اختيار الأنثى', () {
    testWidgets('[CRITICAL] الحافة والأيقونة بالأحمر الدلالي', (tester) async {
      await _pump(tester, value: AppGender.female);
      final red = _colorsOf(AppTheme.light).error;

      expect(_borderColor(tester, GenderedStrings.female), red);
      expect(_iconColor(tester, GenderedStrings.female), red);
    });

    testWidgets('الخيار الآخر يبقى محايداً', (tester) async {
      await _pump(tester, value: AppGender.female);
      final blue = _colorsOf(AppTheme.light).info;

      expect(_borderColor(tester, GenderedStrings.male), isNot(blue));
      expect(_iconColor(tester, GenderedStrings.male), isNot(blue));
    });
  });

  group('قبل الاختيار', () {
    testWidgets('لا بطاقة ملوّنة ولا بطاقة ثالثة للمجهول', (tester) async {
      await _pump(tester, value: null);
      final colors = _colorsOf(AppTheme.light);

      expect(_borderColor(tester, GenderedStrings.male), isNot(colors.info));
      expect(_borderColor(tester, GenderedStrings.female), isNot(colors.error));
      expect(find.text(GenderedStrings.male), findsOneWidget);
      expect(find.text(GenderedStrings.female), findsOneWidget);
    });

    testWidgets('[CRITICAL] `unknown` لا تُلوّن بطاقةً', (tester) async {
      // «مجهول» حالةُ بياناتٍ لا اختيار — لا تُعرض كأنّ الزبون اختار شيئاً.
      await _pump(tester, value: AppGender.unknown);
      final colors = _colorsOf(AppTheme.light);

      expect(_borderColor(tester, GenderedStrings.male), isNot(colors.info));
      expect(_borderColor(tester, GenderedStrings.female), isNot(colors.error));
    });
  });

  group('الوضع الداكن', () {
    testWidgets('الذكر يتبع أزرق الوضع الداكن', (tester) async {
      await _pump(tester, value: AppGender.male, theme: AppTheme.dark);
      expect(
        _borderColor(tester, GenderedStrings.male),
        _colorsOf(AppTheme.dark).info,
      );
    });

    testWidgets('الأنثى تتبع أحمر الوضع الداكن', (tester) async {
      await _pump(tester, value: AppGender.female, theme: AppTheme.dark);
      expect(
        _borderColor(tester, GenderedStrings.female),
        _colorsOf(AppTheme.dark).error,
      );
    });

    testWidgets('[CRITICAL] اللونان يختلفان عن لوني الوضع الفاتح', (tester) async {
      // لو كانا مكتوبين في الودجة لتطابقا — وهذا ما يمنعه الرمز الدلالي.
      expect(
        _colorsOf(AppTheme.dark).info,
        isNot(_colorsOf(AppTheme.light).info),
      );
      expect(
        _colorsOf(AppTheme.dark).error,
        isNot(_colorsOf(AppTheme.light).error),
      );
    });
  });

  group('اللون ليس الإشارة الوحيدة', () {
    testWidgets('الحافة تغلظ عند الاختيار وحالته معلَنة للقارئ', (tester) async {
      await _pump(tester, value: AppGender.male);

      expect(
        _borderWidth(tester, GenderedStrings.male),
        greaterThan(_borderWidth(tester, GenderedStrings.female)!),
      );

      // حالة الاختيار معلَنة على البطاقة نفسها، فيقرأها القارئ الصوتي بلا
      // اعتماد على اللون.
      final cards = tester
          .widgetList<Semantics>(find.byType(Semantics))
          .where((s) => s.properties.label != null)
          .toList();
      final male = cards.firstWhere(
        (s) => s.properties.label == GenderedStrings.male,
      );
      final female = cards.firstWhere(
        (s) => s.properties.label == GenderedStrings.female,
      );
      expect(male.properties.selected, isTrue);
      expect(female.properties.selected, isFalse);
    });
  });

  group('الاتجاهات والمقاسات', () {
    for (final size in const [Size(320, 640), Size(390, 844), Size(834, 1112)]) {
      testWidgets('يعمل على ${size.width.toInt()} عرضاً', (tester) async {
        await _pump(tester, value: AppGender.female, size: size);
        expect(
          _borderColor(tester, GenderedStrings.female),
          _colorsOf(AppTheme.light).error,
        );
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('الألوان نفسها في LTR', (tester) async {
      await _pump(
        tester,
        value: AppGender.male,
        direction: TextDirection.ltr,
      );
      expect(
        _borderColor(tester, GenderedStrings.male),
        _colorsOf(AppTheme.light).info,
      );
    });
  });
}
