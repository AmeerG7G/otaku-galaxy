// شاشة التخصيص جديدة في هذه المرحلة: تُعرض مرة واحدة بعد أول دخول/تسجيل.
// نتحقّق أنها تبني بلا تجاوز تخطيط على كل المقاسات والوضعين وبالـRTL،
// وأن اختيار اللغة/المظهر يطبَّق فوراً على نفس الشاشة.

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/features/settings/presentation/screens/personalize_screen.dart';
import 'package:otaku_galaxy/features/visuals/presentation/character_artwork.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/theme_cubit.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/theme_state.dart';
import 'package:otaku_galaxy/features/settings/presentation/widgets/personalize_cards.dart';
import 'package:otaku_galaxy/core/l10n/locale_scope.dart';
import 'package:otaku_galaxy/features/visuals/domain/visual_slot.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/render_harness.dart';

/// نفس تركيبة شاشة التخصيص بلا اعتماد على الراوتر أو حاوية الحقن.
Widget _personalizeBody() => Builder(
  builder: (context) => ListView(
    padding: const EdgeInsets.fromLTRB(22, 16, 22, 8),
    children: [
      const OtakuGroupLabel(label: 'اللغة', padding: EdgeInsets.only(bottom: 11)),
      BlocBuilder<LocaleCubit, AppLanguage>(
        builder: (context, current) => Row(
          children: [
            for (final language in AppLanguage.values) ...[
              if (language != AppLanguage.values.first) const SizedBox(width: 11),
              Expanded(
                child: LanguageCard(
                  name: language.label,
                  subtitle: 'وصف',
                  selected: current == language,
                  onTap: () => context.read<LocaleCubit>().setLanguage(language),
                ),
              ),
            ],
          ],
        ),
      ),
      const OtakuGroupLabel(
        label: 'المظهر',
        padding: EdgeInsets.fromLTRB(0, 24, 0, 11),
      ),
      BlocBuilder<ThemeCubit, ThemeState>(
        builder: (context, state) => Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: ThemePreviewCard(
                dark: false,
                label: 'فاتح',
                selected: !state.isDark,
                onTap: () => context.read<ThemeCubit>().setDark(false),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: ThemePreviewCard(
                dark: true,
                label: 'داكن',
                selected: state.isDark,
                onTap: () => context.read<ThemeCubit>().setDark(true),
              ),
            ),
          ],
        ),
      ),
    ],
  ),
);

void main() {
  // [CRITICAL] الخطوط الحقيقية: عنوان الترويسة منطقة `BoundedText` تقيس عرض
  // النصّ — بالخطّ البديل (كل حرفٍ مربّع) يُقاس شيءٌ لا علاقة له بالجهاز.
  setUpAll(loadProjectFonts);

  late SharedPreferences prefs;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });

  Widget host({required bool dark}) => MultiBlocProvider(
    providers: [
      BlocProvider(create: (_) => LocaleCubit(prefs)),
      BlocProvider(create: (_) => ThemeCubit(prefs)),
    ],
    child: MaterialApp(
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: dark ? ThemeMode.dark : ThemeMode.light,
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(body: _personalizeBody()),
      ),
    ),
  );

  const sizes = <String, Size>{
    'ref': Size(412, 892),
    'narrow': Size(375, 812),
    'tiny': Size(320, 640),
    // ألواح: الطرف الآخر من المدى.
    'tablet': Size(834, 1112),
    'tablet-landscape': Size(1194, 834),
  };

  for (final dark in [false, true]) {
    for (final size in sizes.entries) {
      final mode = dark ? 'داكن' : 'فاتح';
      testWidgets('personalize builds — $mode — ${size.key}', (tester) async {
        tester.view.physicalSize = size.value;
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.reset);

        await tester.pumpWidget(host(dark: dark));
        await tester.pump(const Duration(milliseconds: 300));
        expect(tester.takeException(), isNull);
      });
    }
  }

  // [REGRESSION GUARD] الشاشة الحقيقية لا نسخةً من جسمها.
  //
  // الاختبارات أعلاه تبني نسخةً من `ListView` وحده، فلم ترَ الترويسة قطّ.
  // حين نُقل سطر الوصف (`FractionallySizedBox(widthFactor: 0.84)`) إلى داخل
  // `Row` صار عرضه `0.84 × ∞` — الصفّ يعطي أطفاله غير المرنة عرضاً غير
  // محدود — فانهار تخطيط الشاشة كلها وظهرت بيضاء بعد الترحيب مباشرة.
  for (final dark in [false, true]) {
    for (final size in sizes.entries) {
      final mode = dark ? 'داكن' : 'فاتح';
      testWidgets('real PersonalizeScreen lays out — $mode — ${size.key}', (
        tester,
      ) async {
        tester.view.physicalSize = size.value;
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.reset);

        await tester.pumpWidget(
          MultiBlocProvider(
            providers: [
              BlocProvider(create: (_) => LocaleCubit(prefs)),
              BlocProvider(create: (_) => ThemeCubit(prefs)),
            ],
            child: MaterialApp(
              theme: AppTheme.light,
              darkTheme: AppTheme.dark,
              themeMode: dark ? ThemeMode.dark : ThemeMode.light,
              home: const Directionality(
                textDirection: TextDirection.rtl,
                child: PersonalizeScreen(),
              ),
            ),
          ),
        );
        await tester.pump(const Duration(milliseconds: 300));
        expect(tester.takeException(), isNull);

        // ما يراه العميل فعلاً: العنوان والوصف والرسم وزر المتابعة.
        expect(find.text(AppStrings.arabic('personalizeTitle')), findsOneWidget);
        expect(find.text(AppStrings.arabic('personalizeBody')), findsOneWidget);
        expect(find.byType(CharacterArtwork), findsOneWidget);
        expect(find.text(AppStrings.arabic('continueLabel')), findsOneWidget);
        final body = tester.getSize(
          find.text(AppStrings.arabic('personalizeBody')),
        );
        expect(body.width, greaterThan(0));
        expect(body.width.isFinite, isTrue);
      });
    }
  }

  testWidgets('picking a theme applies immediately on the same screen', (tester) async {
    tester.view.physicalSize = const Size(412, 892);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(host(dark: false));
    await tester.pump();

    final cubit = tester.element(find.byType(ListView)).read<ThemeCubit>();
    final startedDark = cubit.state.isDark;

    // النقر على البطاقة المقابلة يبدّل الحالة فوراً بلا إعادة دخول.
    await tester.tap(find.text(startedDark ? 'فاتح' : 'داكن'));
    await tester.pump();
    expect(cubit.state.isDark, !startedDark);

    // والعودة للخيار الأول تعمل أيضاً.
    await tester.tap(find.text(startedDark ? 'داكن' : 'فاتح'));
    await tester.pump();
    expect(cubit.state.isDark, startedDark);
  });

  testWidgets('picking a language applies immediately', (tester) async {
    tester.view.physicalSize = const Size(412, 892);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(host(dark: false));
    await tester.pump();

    final cubit = tester.element(find.byType(ListView)).read<LocaleCubit>();
    final other = AppLanguage.values.firstWhere((l) => l != cubit.state);

    await tester.tap(find.text(other.label));
    await tester.pump();
    expect(cubit.state, other);
  });

  // ── [GEOMETRY LOCK] الترويسة ثابتة بغضّ النظر عن اللغة ──────────────────
  //
  // يتحقّق هذا الجزء أن الـSizedBox(height:129) يعزل الفاصل وكل ما تحته
  // عن طول العنوان. الهندسة هي المحور: الفن والفاصل والجسم والزر يجب أن
  // يكونوا في نفس الإحداثيات المطلقة في العربية والكردية.

  Widget geometryHost({
    required AppLanguage language,
    required SharedPreferences prefs,
  }) => MultiBlocProvider(
    providers: [
      BlocProvider(create: (_) => LocaleCubit(prefs)..emit(language)),
      BlocProvider(create: (_) => ThemeCubit(prefs)),
    ],
    child: MaterialApp(
      theme: AppTheme.light,
      builder: (context, child) =>
          LocaleScope(language: language, child: child!),
      home: const Directionality(
        textDirection: TextDirection.rtl,
        child: PersonalizeScreen(),
      ),
    ),
  );

  group('header geometry is language-independent', () {
    final geometryCases = <(String, Size, double)>[
      ('412×892 scale 1.0', const Size(412, 892), 1.0),
      ('412×892 scale 1.3', const Size(412, 892), 1.3),
      ('375×812 scale 1.0', const Size(375, 812), 1.0),
    ];

    for (final (label, size, scale) in geometryCases) {
      testWidgets(label, (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1.0;
        tester.platformDispatcher.textScaleFactorTestValue = scale;
        addTearDown(() {
          tester.view.reset();
          tester.platformDispatcher.clearTextScaleFactorTestValue();
        });

        final artFinder = find.byWidgetPredicate(
          (w) => w is CharacterArtwork && w.slot == VisualSlots.personalize,
        );
        final dividerFinder = find.byKey(PersonalizeScreen.dividerKey);
        final logoFinder = find.byType(OtakuStoreLogoSimple);

        // Arabic render.
        await tester.pumpWidget(geometryHost(language: AppLanguage.arabic, prefs: prefs));
        await tester.pump(const Duration(milliseconds: 300));
        expect(tester.takeException(), isNull);
        final artAr = tester.getRect(artFinder);
        final dividerAr = tester.getRect(dividerFinder);
        final logoAr = tester.getRect(logoFinder);

        // Kurdish render — same size, same scale.
        await tester.pumpWidget(geometryHost(language: AppLanguage.kurdish, prefs: prefs));
        await tester.pump(const Duration(milliseconds: 300));
        expect(tester.takeException(), isNull);
        final artCkb = tester.getRect(artFinder);
        final dividerCkb = tester.getRect(dividerFinder);
        final logoCkb = tester.getRect(logoFinder);

        // Character artwork must be at the same position.
        expect(artCkb.top, closeTo(artAr.top, 1.0),
            reason: 'art.top differs between ar and ckb ($label)');
        expect(artCkb.bottom, closeTo(artAr.bottom, 1.0),
            reason: 'art.bottom differs between ar and ckb ($label)');

        // Divider must be at the same Y — this is the key invariant.
        expect(dividerCkb.top, closeTo(dividerAr.top, 1.0),
            reason: 'divider.top differs between ar and ckb ($label)');

        // [CRITICAL] الشعار أيضاً (2026-10-05): كان العمود يكبر بسطر العنوان
        // الكردي الثاني فيصعد الشعار ~١٨ بكسل — ولم يكن هذا الاختبار يقيسه.
        expect(logoCkb.top, closeTo(logoAr.top, 1.0),
            reason: 'logo.top differs between ar and ckb ($label)');
        expect(logoCkb.left, closeTo(logoAr.left, 1.0),
            reason: 'logo.left differs between ar and ckb ($label)');
      });
    }

    // [PRODUCT] الشاشة الضيّقة مع ×1.3 (قرار المالك 2026-10-05): الحدّ الأدنى
    // ٠٫٨ يبقى، والعنوان الكردي لا يتّسع لسطرين حتى عنده (يحتاج ٠٫٦٤)،
    // فيطول سطراً ثالثاً هنا وحده وتطول الترويسة معه. العربية تتّسع لسطرين
    // فلا تطول. المهمّ: لا قصّ ولا انهيار، والنموّ حيث لا بدّ منه فقط.
    testWidgets('320×568 scale 1.3 — third line only where the floor fails', (tester) async {
      tester.view.physicalSize = const Size(320, 568);
      tester.view.devicePixelRatio = 1.0;
      tester.platformDispatcher.textScaleFactorTestValue = 1.3;
      addTearDown(() {
        tester.view.reset();
        tester.platformDispatcher.clearTextScaleFactorTestValue();
      });

      final lines = <AppLanguage, int>{};
      for (final lang in AppLanguage.values) {
        await tester.pumpWidget(geometryHost(language: lang, prefs: prefs));
        await tester.pump(const Duration(milliseconds: 300));
        expect(tester.takeException(), isNull,
            reason: 'layout error for ${lang.code} at 320×568 scale 1.3');
        final title = tester.renderObject<RenderParagraph>(find.descendant(
          of: find.byKey(const Key('personalize_title')),
          matching: find.byType(RichText),
        ));
        expect(title.didExceedMaxLines, isFalse, reason: '${lang.code}: العنوان مقصوص');
        expect(title.text.style!.fontSize!, greaterThanOrEqualTo(25 * kBoundedTextMinScale));
        lines[lang] = title.maxLines!;
      }
      expect(lines[AppLanguage.arabic], 2);
      expect(lines[AppLanguage.kurdish], 3);
    });
  });
}
