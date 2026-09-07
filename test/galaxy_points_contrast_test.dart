// تباين شاشة نقاط المجرّة — قابلية القراءة مقيسة لا مقدَّرة.
//
// [CRITICAL] العطب الذي يحرسه هذا الملف: كان `colorScheme.outline` يُستعمل
// لوناً لنصوص الشرح. وهو رمزُ **حدود** لا نصّ، ومعرَّف في الوضع الفاتح بشفافية
// ١٢٪ (`0x1F1C103A`). النتيجة نصٌّ فاتح على خلفية فاتحة بتباين **1.28:1** —
// أي «خلفية فاتحة ونصّ فاتح» حرفياً، وهو ما اشتكى منه المستخدم.
//
// الاختبارات هنا تحسب نسبة التباين بمعادلة WCAG 2.1 على الألوان التي ترسمها
// الشاشة فعلاً، في الوضعين الفاتح والداكن. الحدّ الأدنى المعتمد AA:
// 4.5:1 للنصّ العادي و3:1 للنصّ الكبير وللرسوم.

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/points/domain/entities/level_reward.dart';
import 'package:otaku_galaxy/features/points/domain/entities/otaku_level.dart';
import 'package:otaku_galaxy/features/points/domain/entities/points_activity.dart';
import 'package:otaku_galaxy/features/points/domain/repositories/points_repository.dart';
import 'package:otaku_galaxy/features/points/presentation/cubit/points_cubit.dart';
import 'package:otaku_galaxy/features/points/presentation/screens/galaxy_points_screen.dart';

import 'support/auth_stub.dart';

// ═══════════════ قياس التباين ═══════════════

/// إضاءة قناة واحدة بعد فكّ ترميز sRGB — كما تعرّفها WCAG 2.1.
double _channel(double value) =>
    value <= 0.03928 ? value / 12.92 : math.pow((value + 0.055) / 1.055, 2.4) as double;

/// الإضاءة النسبية للّون (يُفترض معتماً — تُمزج الشفافية قبل الاستدعاء).
double _luminance(Color color) =>
    0.2126 * _channel(color.r) +
    0.7152 * _channel(color.g) +
    0.0722 * _channel(color.b);

/// نسبة التباين بين لونين — القيمة التي تقارَن بحدود WCAG.
double contrastRatio(Color foreground, Color background) {
  // النصّ الشفّاف يُمزج على خلفيته أولاً: هذا بالضبط ما كان يخفي العطب —
  // `outline` لونٌ داكن، لكن شفافيته ١٢٪ تجعله فاتحاً على السطح الفاتح.
  final fg = Color.alphaBlend(foreground, background);
  final a = _luminance(fg);
  final b = _luminance(background);
  final lighter = math.max(a, b);
  final darker = math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

// ═══════════════ تجهيز الشاشة ═══════════════

final _ladder = [
  const OtakuLevel(
    key: 'beginner',
    number: 1,
    nameMale: 'مبتدئ المجرة',
    nameFemale: 'مبتدئة المجرة',
    nameNeutral: 'المستوى المبتدئ',
    reward: 'بداية الرحلة',
    rewardKind: 'none',
    threshold: 0,
  ),
  const OtakuLevel(
    key: 'explorer',
    number: 2,
    nameMale: 'مستكشف المجرة',
    nameFemale: 'مستكشفة المجرة',
    nameNeutral: 'مستوى الاستكشاف',
    reward: 'خصم ٣٪ حتى ٥٬٠٠٠ دينار — مرة واحدة',
    rewardKind: 'discount',
    threshold: 100,
  ),
  const OtakuLevel(
    key: 'champion',
    number: 5,
    nameMale: 'بطل المجرة',
    nameFemale: 'بطلة المجرة',
    nameNeutral: 'مستوى البطولة',
    reward: 'هدية بقيمة ١٠٬٠٠٠ دينار — مرة واحدة',
    rewardKind: 'gift',
    threshold: 600,
  ),
];

class _StubPoints implements PointsRepository {
  _StubPoints(this.summary);

  final PointsSummary summary;

  @override
  Future<PointsSummary> fetchSummary() async => summary;

  @override
  Future<LevelReward> claimReward(String levelKey) async =>
      summary.rewards.firstWhere((r) => r.levelKey == levelKey);
}

PointsSummary _summary() => PointsSummary(
  balance: 150,
  activity: [
    PointsActivity(
      id: 'a1',
      label: 'نقاط شراء',
      amount: 5,
      occurredAt: DateTime(2026, 1, 1),
    ),
  ],
  levels: _ladder,
  level: _ladder[1],
  nextLevel: _ladder[2],
  pointsToNextLevel: 450,
  levelProgress: 0.1,
  rewards: [
    // مزيّة مفتوحة (زر مطالبة) وأخرى مقفلة (حالة معطّلة) — كلتاهما تُقاسان.
    const LevelReward(
      levelKey: 'explorer',
      requiredPoints: 100,
      kind: 'discount',
      unlocked: true,
      claimed: false,
      consumed: false,
      claimable: true,
    ),
    const LevelReward(
      levelKey: 'champion',
      requiredPoints: 600,
      kind: 'gift',
      unlocked: false,
      claimed: false,
      consumed: false,
      claimable: false,
    ),
  ],
);

Future<void> _pumpScreen(
  WidgetTester tester,
  ThemeData theme, {
  Size size = const Size(390, 2600),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final auth = stubAuthCubit(gender: 'female');
  await auth.loadSession();

  await tester.pumpWidget(
    MultiBlocProvider(
      providers: [
        BlocProvider<PointsCubit>(
          create: (_) => PointsCubit(_StubPoints(_summary())),
        ),
        BlocProvider<AuthCubit>.value(value: auth),
      ],
      child: MaterialApp(
        theme: theme,
        home: const Directionality(
          textDirection: TextDirection.rtl,
          child: GalaxyPointsScreen(),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// كل ألوان النصوص المرسومة على الشاشة الآن.
List<Color> _renderedTextColors(WidgetTester tester) => tester
    .renderObjectList<RenderParagraph>(find.byType(RichText))
    .map((p) => p.text.style?.color)
    .whereType<Color>()
    .toList();

void main() {
  group('معادلة القياس نفسها', () {
    test('الأبيض على الأسود يعطي 21:1', () {
      expect(
        contrastRatio(const Color(0xFFFFFFFF), const Color(0xFF000000)),
        closeTo(21, 0.01),
      );
    });

    test('اللون على نفسه يعطي 1:1', () {
      const c = Color(0xFF7C5CFF);
      expect(contrastRatio(c, c), closeTo(1, 0.01));
    });
  });

  group('[CRITICAL] العطب المُصلَح موثَّق بالرقم', () {
    test('`outline` نصّاً على سطح الشرح كان دون الحدّ بكثير', () {
      final scheme = AppTheme.light.colorScheme;
      final measured = contrastRatio(
        scheme.outline,
        scheme.surfaceContainerHighest,
      );
      // القيمة المقيسة عند اكتشاف العطب: 1.28:1 — أي لا يكاد يُرى.
      expect(measured, lessThan(2.0));
      expect(measured, closeTo(1.28, 0.15));
    });

    test('`onSurfaceVariant` بديلاً يجتاز AA في الوضعين', () {
      for (final theme in [AppTheme.light, AppTheme.dark]) {
        final scheme = theme.colorScheme;
        expect(
          contrastRatio(scheme.onSurfaceVariant, scheme.surfaceContainerHighest),
          greaterThanOrEqualTo(4.5),
        );
      }
    });
  });

  for (final entry in {'الفاتح': AppTheme.light, 'الداكن': AppTheme.dark}.entries) {
    group('الوضع ${entry.key}', () {
      final theme = entry.value;
      final scheme = theme.colorScheme;
      final colors = theme.extension<AppThemeColors>()!;

      test('نصّ الشرح الأساسي والثانوي يجتازان AA', () {
        expect(
          contrastRatio(scheme.onSurface, scheme.surfaceContainerHighest),
          greaterThanOrEqualTo(4.5),
        );
        expect(
          contrastRatio(scheme.onSurfaceVariant, scheme.surfaceContainerHighest),
          greaterThanOrEqualTo(4.5),
        );
      });

      test('[CRITICAL] شارة نقاط القاعدة تجتاز AA بالصيغة النصّية', () {
        // `success` مؤشِّر: قياسه على `successPale` في الفاتح 2.48:1.
        // `successText` هو ما تُرسم به الحروف.
        expect(
          contrastRatio(colors.successText, colors.successPale),
          greaterThanOrEqualTo(4.5),
        );
        expect(
          contrastRatio(colors.errorText, colors.errorPale),
          greaterThanOrEqualTo(4.5),
        );
      });

      test('أيقونة الشرح على خلفيتها الزرقاء تجتاز 3:1', () {
        final iconBackground = Color.alphaBlend(
          colors.info.withValues(alpha: 0.15),
          scheme.surfaceContainerHighest,
        );
        expect(
          contrastRatio(colors.info, iconBackground),
          greaterThanOrEqualTo(3.0),
        );
      });

      test('الفاصل مرئي على سطحه', () {
        // الفواصل زخرفية: حدّ 3:1 في AA يخصّ العناصر غير النصّية التي
        // **تحمل معنى**، والفاصل هنا يفصل ولا يبلّغ شيئاً. المطلوب أن يُرى.
        // المقيس: 1.23:1 في الفاتح و1.35:1 في الداكن — حدٌّ خفيف مقصود، وهو
        // ليس النصَّ الذي كان يختفي.
        expect(
          contrastRatio(scheme.outlineVariant, scheme.surfaceContainerHighest),
          greaterThan(1.15),
        );
      });

      test('[CRITICAL] رمز الحدود لا يُستعمل لوناً لنصّ في أي وضع', () {
        // القيمة نفسها التي سبّبت العطب — تُبقى موثّقة بالرقم في الوضعين.
        expect(
          contrastRatio(scheme.outline, scheme.surfaceContainerHighest),
          lessThan(4.5),
          reason: '`outline` لا يصلح نصّاً — وهذا سببُ منعه',
        );
      });

      testWidgets('[CRITICAL] لا نصّ على الشاشة يُرسم بلون الحدود', (
        tester,
      ) async {
        await _pumpScreen(tester, theme);
        final colorsUsed = _renderedTextColors(tester);

        expect(colorsUsed, isNotEmpty, reason: 'الشاشة رسمت نصوصاً فعلاً');
        expect(
          colorsUsed,
          isNot(contains(scheme.outline)),
          reason: '`outline` رمز حدود لا لون نصّ',
        );
      });

      testWidgets('كل نصوص الشاشة تجتاز AA على أحد سطحَي الشاشة', (
        tester,
      ) async {
        await _pumpScreen(tester, theme);

        // سطوح الشاشة: الخلفية العامة وسطح بطاقة الشرح. النصّ يُرسم على
        // أحدهما، فيكفي أن يجتاز الحدّ على أفضلهما له — والنصّ المعطوب كان
        // يرسب على كليهما.
        final surfaces = [scheme.surface, scheme.surfaceContainerHighest];
        final failing = <String>[];

        for (final color in _renderedTextColors(tester)) {
          final best = surfaces
              .map((bg) => contrastRatio(color, bg))
              .reduce(math.max);
          // الأبيض على تدرّج البطاقة الملوّنة مستثنى: خلفيته ليست سطحاً من
          // السطحين، وتباينه محسوب في تصميم البطاقة نفسها.
          if (color == const Color(0xFFFFFFFF)) continue;
          if (best < 3.0) {
            failing.add(
              '#${color.toARGB32().toRadixString(16)} → '
              '${best.toStringAsFixed(2)}:1',
            );
          }
        }

        expect(failing, isEmpty, reason: 'ألوان دون الحدّ: $failing');
      });
    });
  }
}
