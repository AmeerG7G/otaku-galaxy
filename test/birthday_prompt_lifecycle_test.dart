// [CRITICAL REGRESSION GUARD] ورقة تاريخ الميلاد لا تُسقط التطبيق.
//
// الشاشة الحمراء المبلَّغ عنها: `framework.dart` — `InheritedElement.notifyClients`
// يجد معتمِداً لم يعد من نسله. يظهر عند إغلاق الورقة بنقرةٍ خارجها (تغيّر
// `MediaQuery` مع نزول لوحة المفاتيح) ثم مجدداً عند تبديل المظهر (إخطار
// `Theme`). السبب الأصلي على هذا المسار: `showBirthdayPrompt` يحرّر
// `TextEditingController` في `finally` لحظة اكتمال `showModalBottomSheet` —
// أي عند **بدء** الإغلاق، بينما حقول الورقة ما زالت مركّبة طوال حركة الخروج
// وتكتب في المتحكّم عند فقدان التركيز.
//
// هذا الاختبار يمرّ بمصفوفة المستخدم: فتح، نقر خارج، إغلاق، تبديل مظهر،
// إعادة فتح، حفظ، رجوع، تكرار — ويطالب بألّا يُرمى أي استثناء.

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get_it/get_it.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';
import 'package:otaku_galaxy/features/birthday/data/birthday_storage.dart';
import 'package:otaku_galaxy/features/birthday/presentation/birthday_prompt.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// `Dio` بلا شبكة: الحفظ يفشل محلياً، وهو كافٍ لدورة حياة الورقة.
Dio _offlineDio() {
  final dio = Dio();
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) => handler.reject(
        DioException.connectionError(requestOptions: options, reason: 'offline'),
        true,
      ),
    ),
  );
  return dio;
}

final _dark = ValueNotifier<bool>(false);

class _Host extends StatelessWidget {
  const _Host();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Builder(
          builder: (context) => TextButton(
            onPressed: () => showBirthdayPrompt(context),
            child: const Text('open'),
          ),
        ),
      ),
    );
  }
}

Future<LocaleCubit> _pump(WidgetTester tester) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  final locale = LocaleCubit(prefs);
  addTearDown(locale.close);

  if (!GetIt.I.isRegistered<BirthdayStorage>()) {
    GetIt.I.registerLazySingleton<BirthdayStorage>(
      () => BirthdayStorage(api: ApiClient(dio: _offlineDio())),
    );
  }
  addTearDown(() => GetIt.I.reset());
  _dark.value = false;

  await tester.pumpWidget(
    BlocProvider<LocaleCubit>.value(
      value: locale,
      child: BlocBuilder<LocaleCubit, AppLanguage>(
        builder: (context, language) => ValueListenableBuilder<bool>(
          valueListenable: _dark,
          builder: (context, dark, _) => MaterialApp(
            theme: AppTheme.light,
            darkTheme: AppTheme.dark,
            themeMode: dark ? ThemeMode.dark : ThemeMode.light,
            themeAnimationDuration: Duration.zero,
            home: const Directionality(
              textDirection: TextDirection.rtl,
              child: _Host(),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return locale;
}

/// يدفع إطارات الحركة واحداً واحداً ويجمع أي استثناء يظهر بينها.
Future<List<Object>> _pumpCollecting(WidgetTester tester, {int frames = 12}) async {
  final errors = <Object>[];
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 50));
    final e = tester.takeException();
    if (e != null) errors.add(e);
  }
  return errors;
}

Future<void> _open(WidgetTester tester) async {
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
  expect(find.text(AppStrings.arabic('birthdayTitle')), findsOneWidget);
}

/// يركّز حقل اليوم ويحاكي لوحة المفاتيح بإزاحة سفلية.
Future<void> _focusDay(WidgetTester tester) async {
  await tester.tap(find.byType(TextFormField).first);
  await tester.pump();
  tester.view.viewInsets = const FakeViewPadding(bottom: 320);
  await tester.pump();
}

/// نقر خارج الورقة (الستارة) مع نزول لوحة المفاتيح — كما يفعل المستخدم.
Future<List<Object>> _dismissByBarrier(WidgetTester tester) async {
  await tester.tapAt(const Offset(20, 40));
  tester.view.viewInsets = FakeViewPadding.zero;
  final errors = await _pumpCollecting(tester);
  await tester.pumpAndSettle();
  final late = tester.takeException();
  if (late != null) errors.add(late);
  expect(find.text(AppStrings.arabic('birthdayTitle')), findsNothing);
  return errors;
}

Future<List<Object>> _toggleTheme(WidgetTester tester) async {
  _dark.value = !_dark.value;
  final errors = await _pumpCollecting(tester, frames: 3);
  await tester.pumpAndSettle();
  final late = tester.takeException();
  if (late != null) errors.add(late);
  return errors;
}

void main() {
  testWidgets('[CRITICAL] فتح → تركيز → نقر خارج → تبديل المظهر: بلا استثناء',
      (tester) async {
    await _pump(tester);

    await _open(tester);
    await _focusDay(tester);
    final onDismiss = await _dismissByBarrier(tester);
    expect(onDismiss, isEmpty, reason: 'استثناءات أثناء الإغلاق: $onDismiss');

    final onTheme = await _toggleTheme(tester);
    expect(onTheme, isEmpty, reason: 'استثناءات عند تبديل المظهر: $onTheme');
  });

  testWidgets('إعادة الفتح بعد الإغلاق والمظهر الداكن، ثم الحفظ الفاشل بلا شبكة',
      (tester) async {
    await _pump(tester);

    await _open(tester);
    await _focusDay(tester);
    await _dismissByBarrier(tester);
    await _toggleTheme(tester);

    await _open(tester);
    await tester.enterText(find.byType(TextFormField).at(0), '7');
    await tester.enterText(find.byType(TextFormField).at(1), '3');
    await tester.tap(find.text(AppStrings.arabic('save')));
    final errors = await _pumpCollecting(tester);
    await tester.pumpAndSettle();
    final late = tester.takeException();
    if (late != null) errors.add(late);
    // الحفظ يفشل (بلا شبكة) فتظهر رسالة — لا استثناء.
    expect(errors, isEmpty, reason: 'استثناءات بعد الحفظ: $errors');
    expect(find.byType(SnackBar), findsOneWidget);
  });

  testWidgets('التكرار بعد تبديل اللغة إلى الكردية', (tester) async {
    final locale = await _pump(tester);
    await locale.setLanguage(AppLanguage.kurdish);
    await tester.pumpAndSettle();

    for (var round = 0; round < 2; round++) {
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      await _focusDay(tester);
      await tester.tapAt(const Offset(20, 40));
      tester.view.viewInsets = FakeViewPadding.zero;
      final errors = await _pumpCollecting(tester);
      await tester.pumpAndSettle();
      final late = tester.takeException();
      if (late != null) errors.add(late);
      expect(errors, isEmpty, reason: 'الجولة $round: $errors');
      final theme = await _toggleTheme(tester);
      expect(theme, isEmpty, reason: 'المظهر في الجولة $round: $theme');
    }
  });
}
