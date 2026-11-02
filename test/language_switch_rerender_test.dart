// [CRITICAL REGRESSION GUARD] تبديل اللغة يُعيد رسم الشاشات المفتوحة.
//
// كان `context.strings` يقرأ `LocaleCubit` بـ`read` بلا اعتماد موروث، على
// افتراض أن `BlocBuilder<LocaleCubit>` فوق `MaterialApp` «يعيد بناء الشجرة
// كلها». الافتراض خاطئ: `localeResolutionCallback` يثبّت `ar` فلا تتغيّر
// `Localizations`، و`ThemeData` متساوٍ قيمةً فلا يُخطر `Theme`، وصفحة كل
// مسار مخبّأة في `_ModalScopeState`. فكل شاشة مبنية قبل التبديل (التبويبات
// في `IndexedStack`، الإعدادات، أي شاشة مدفوعة) تبقى بلغتها القديمة حتى
// تُبنى لسببٍ آخر — وهذا بالضبط «بقاء نصوص كردية بعد التبديل للعربية».
//
// الاختبار يكرّر بنية `app.dart` (لا ينسخ الحقن كله) ويقيس ما يُرسم.

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/l10n/locale_scope.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _key = 'settings';
final _ar = AppStrings.arabic(_key);
final _ckb = AppStrings.kurdish(_key);

/// شاشة تقرأ نصّها عبر `context.strings` كما تفعل كل شاشات التطبيق.
class _Screen extends StatelessWidget {
  const _Screen({required this.tag});

  final String tag;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(child: Text('$tag ${context.strings(_key)}')),
    );
  }
}

/// المسار الأول — يدفع شاشةً ثانية كما يفعل التطبيق حين يفتح الإعدادات.
class _Launcher extends StatelessWidget {
  const _Launcher();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          Text('home ${context.strings(_key)}'),
          TextButton(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => const _Screen(tag: 'pushed'),
              ),
            ),
            child: const Text('push'),
          ),
        ],
      ),
    );
  }
}

Future<LocaleCubit> _pumpApp(WidgetTester tester) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  final locale = LocaleCubit(prefs);
  addTearDown(locale.close);

  await tester.pumpWidget(
    BlocProvider<LocaleCubit>.value(
      value: locale,
      child: BlocBuilder<LocaleCubit, AppLanguage>(
        builder: (context, language) => MaterialApp(
          locale: language.locale,
          supportedLocales: AppLanguage.values.map((l) => l.locale),
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          localeResolutionCallback: (locale, supported) => const Locale('ar'),
          // كما في `app.dart`: النطاق الموروث فوق الموجّه هو آلية إعادة الرسم.
          builder: (context, child) => LocaleScope(
            language: language,
            child: child ?? const SizedBox.shrink(),
          ),
          home: const _Launcher(),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return locale;
}

void main() {
  setUpAll(() {
    expect(_ar, isNot(_ckb), reason: 'المفتاح المختار مترجَم فعلاً');
  });

  test('[TRIPWIRE] app.dart يركّب LocaleScope داخل builder فوق الموجّه', () {
    // الاختبارات الودجية أعلاه تثبت الآلية؛ هذا يثبت أن التطبيق يستعملها.
    final src = File('lib/app/view/app.dart').readAsStringSync();
    final builderAt = src.indexOf('builder: (context, child) => LocaleScope(');
    final routerAt = src.indexOf('routerConfig:');
    expect(builderAt, greaterThan(0), reason: 'LocaleScope غائب من builder');
    expect(routerAt, greaterThan(builderAt));
    expect(src, contains('language: language,'));
  });

  test('[TRIPWIRE] context.strings يمرّ بالنطاق الموروث لا بـ read وحده', () {
    final src = File('lib/core/l10n/app_strings.dart').readAsStringSync();
    expect(src, contains('LocaleScope.maybeOf(this)'));
    expect(src, contains('AppStrings get strings => AppStrings.of(language);'));
  });

  testWidgets('[CRITICAL] شاشة المسار الأول تتبدّل مع اللغة', (tester) async {
    final locale = await _pumpApp(tester);
    expect(find.text('home $_ar'), findsOneWidget);

    await locale.setLanguage(AppLanguage.kurdish);
    await tester.pumpAndSettle();
    expect(find.text('home $_ckb'), findsOneWidget, reason: 'كردية بعد التبديل');
    expect(find.text('home $_ar'), findsNothing, reason: 'لا عربية باقية');

    await locale.setLanguage(AppLanguage.arabic);
    await tester.pumpAndSettle();
    expect(find.text('home $_ar'), findsOneWidget, reason: 'العودة للعربية');
    expect(find.text('home $_ckb'), findsNothing, reason: 'لا كردية باقية');
  });

  testWidgets('[CRITICAL] الشاشة المدفوعة فوق المسار الأول تتبدّل أيضاً',
      (tester) async {
    final locale = await _pumpApp(tester);
    await tester.tap(find.text('push'));
    await tester.pumpAndSettle();
    expect(find.text('pushed $_ar'), findsOneWidget);

    await locale.setLanguage(AppLanguage.kurdish);
    await tester.pumpAndSettle();
    expect(find.text('pushed $_ckb'), findsOneWidget);
    expect(find.text('pushed $_ar'), findsNothing);

    // والشاشة الخلفية (المخفيّة) تتبدّل معها لا حين تعود للواجهة فقط.
    Navigator.of(tester.element(find.text('pushed $_ckb'))).pop();
    await tester.pumpAndSettle();
    expect(find.text('home $_ckb'), findsOneWidget);
  });
}
