// شاشة التخصيص جديدة في هذه المرحلة: تُعرض مرة واحدة بعد أول دخول/تسجيل.
// نتحقّق أنها تبني بلا تجاوز تخطيط على كل المقاسات والوضعين وبالـRTL،
// وأن اختيار اللغة/المظهر يطبَّق فوراً على نفس الشاشة.

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/theme_cubit.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/theme_state.dart';
import 'package:otaku_galaxy/features/settings/presentation/widgets/personalize_cards.dart';
import 'package:shared_preferences/shared_preferences.dart';

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
}
