import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/config/app_config.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/di/injection_container.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/l10n/locale_scope.dart';
import 'package:otaku_galaxy/core/router/app_router.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:otaku_galaxy/features/settings/presentation/screens/settings_screen.dart';

import 'support/auth_stub.dart';
import 'support/render_harness.dart';

/// سياسة كلمة المرور في نموذجَي التطبيق (STEP 85): التسجيل وتغيير الكلمة.
///
/// القواعد نفسها مُختبرة في `password_policy_test.dart`؛ هنا يُثبت أن كل
/// نموذج يستدعيها بالسياق الصحيح (رقمه، اسمه، دوره) ويعرض رسالتها بلغته.
String _ar(String key) => AppStrings.of(AppLanguage.arabic)(key);
String _ckb(String key) => AppStrings.of(AppLanguage.kurdish)(key);

class _Router extends RootStackRouter {
  @override
  List<AutoRoute> get routes => [
    AutoRoute(
      initial: true,
      path: '/home',
      page: PageInfo(
        'HomePlaceholderRoute',
        builder: (_) => const Scaffold(body: SizedBox.shrink()),
      ),
    ),
    AutoRoute(path: '/register', page: RegisterRoute.page),
    AutoRoute(path: '/login', page: LoginRoute.page),
    AutoRoute(path: '/account-pending', page: AccountPendingRoute.page),
  ];

  @override
  RouteType get defaultRouteType => const RouteType.material();
}

Future<void> _pumpRegister(WidgetTester tester) async {
  tester.view.physicalSize = const Size(412, 1400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  final router = _Router();
  await tester.pumpWidget(
    BlocProvider<AuthCubit>.value(
      value: stubAuthCubit(),
      child: MaterialApp.router(
        theme: AppTheme.light,
        locale: const Locale('ar'),
        routerConfig: router.config(),
      ),
    ),
  );
  await tester.pump();
  router.push(const RegisterRoute());
  await tester.pumpAndSettle();
}

/// الحقول بترتيبها في الشاشة: الاسم، الهاتف، كلمة المرور.
Future<void> _submitRegister(
  WidgetTester tester, {
  String username = 'زائر المجرة',
  String phone = '07701234567',
  required String password,
}) async {
  final fields = find.byType(TextFormField);
  await tester.enterText(fields.at(0), username);
  await tester.enterText(fields.at(1), phone);
  await tester.enterText(fields.at(2), password);
  await tester.testTextInput.receiveAction(TextInputAction.done);
  await tester.pump();
}

Future<void> _pumpChangeForm(
  WidgetTester tester, {
  AppLanguage language = AppLanguage.arabic,
  bool admin = false,
}) async {
  tester.view.physicalSize = const Size(412, 1000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    LocaleScope(
      language: language,
      child: MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(
          body: ChangePasswordForm(
            phone: '+9647701234567',
            username: 'Ameer',
            admin: admin,
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

/// الحقول: الحالية، الجديدة، التأكيد — ثم «حفظ».
Future<void> _submitChange(WidgetTester tester, String next) async {
  final fields = find.byType(TextFormField);
  await tester.enterText(fields.at(0), 'old-password-1');
  await tester.enterText(fields.at(1), next);
  await tester.enterText(fields.at(2), next);
  await tester.testTextInput.receiveAction(TextInputAction.done);
  await tester.pump();
}

void main() {
  setUpAll(loadProjectFonts);
  setUpAll(() {
    if (!sl.isRegistered<AppConfig>()) {
      sl.registerLazySingleton<AppConfig>(() => AppConfig.development);
    }
  });

  group('التسجيل', () {
    for (final (password, key) in [
      ('123456', 'passwordMinLength'),
      ('password123', 'passwordWeak'),
      ('12345678', 'passwordWeak'),
      ('11111111', 'passwordWeak'),
      ('qwerty123', 'passwordWeak'),
      ('          ', 'passwordBlank'),
      ('river-lantern-' * 6, 'passwordTooLong'),
    ]) {
      testWidgets('«$password» ← $key', (tester) async {
        await _pumpRegister(tester);
        await _submitRegister(tester, password: password);
        expect(find.text(_ar(key)), findsOneWidget);
      });
    }

    testWidgets('الرقم المكتوب في النموذج نفسه محظور داخل الكلمة', (
      tester,
    ) async {
      await _pumpRegister(tester);
      await _submitRegister(
        tester,
        phone: '07701234567',
        password: 'x07701234567y',
      );
      expect(find.text(_ar('passwordContainsPhone')), findsOneWidget);
    });

    testWidgets('الاسم المكتوب في النموذج نفسه محظور داخل الكلمة', (
      tester,
    ) async {
      await _pumpRegister(tester);
      await _submitRegister(
        tester,
        username: 'Ameer',
        password: 'ameer-river-731',
      );
      expect(find.text(_ar('passwordContainsUsername')), findsOneWidget);
    });

    testWidgets('عبارة مرور عربية قوية لا تُعرض لها رسالة', (tester) async {
      await _pumpRegister(tester);
      await _submitRegister(tester, password: 'أحب القهوة كثيراً');
      for (final key in [
        'passwordMinLength',
        'passwordWeak',
        'passwordBlank',
        'passwordTooLong',
        'passwordContainsPhone',
        'passwordContainsUsername',
      ]) {
        expect(find.text(_ar(key)), findsNothing, reason: key);
      }
    });
  });

  group('تغيير كلمة المرور', () {
    testWidgets('ضعيفة ← رسالة الخادم نفسها', (tester) async {
      await _pumpChangeForm(tester);
      await _submitChange(tester, 'password123');
      expect(find.text(_ar('passwordWeak')), findsOneWidget);
    });

    testWidgets('تحوي رقم صاحب الحساب أو اسمه', (tester) async {
      await _pumpChangeForm(tester);
      await _submitChange(tester, 'my-07701234567-x');
      expect(find.text(_ar('passwordContainsPhone')), findsOneWidget);

      await _submitChange(tester, 'AMEER-rocks-9');
      expect(find.text(_ar('passwordContainsUsername')), findsOneWidget);
    });

    testWidgets('زبون: ١٠ أحرف قوية مقبولة', (tester) async {
      await _pumpChangeForm(tester);
      await _submitChange(tester, 'k7#mPq2z-9');
      expect(find.text(_ar('passwordAdminMinLength')), findsNothing);
      expect(find.text(_ar('passwordMinLength')), findsNothing);
    });

    testWidgets('مسؤول على المسار المشترك: الحدّ ١٢', (tester) async {
      await _pumpChangeForm(tester, admin: true);
      await _submitChange(tester, 'k7#mPq2z-9');
      expect(find.text(_ar('passwordAdminMinLength')), findsOneWidget);
    });

    testWidgets('الرسالة بالكردية في الواجهة الكردية', (tester) async {
      await _pumpChangeForm(tester, language: AppLanguage.kurdish);
      await _submitChange(tester, 'qwerty123');
      expect(find.text(_ckb('passwordWeak')), findsOneWidget);
      expect(find.text(_ar('passwordWeak')), findsNothing);
    });
  });
}
