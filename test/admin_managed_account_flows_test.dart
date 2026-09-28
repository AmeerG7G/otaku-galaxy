// تدفّقات الحساب التي تحسمها الإدارة — التسجيل ونسيان كلمة المرور بلا رمز.
//
// ═══ القرار ═══ لا SMS ولا بريد. الاستمارة كما كانت، لكن الإرسال ينشئ
// **طلباً** ويُظهر شاشة «قيد المراجعة»؛ لا شاشة رمز، لا عدّاد إعادة إرسال،
// لا مسار في التطبيق يفعّل حساباً أو يغيّر كلمة مرور بلا جلسة.
//
// أهداف الأفخاخ:
//   A. إعادة توجيه التسجيل إلى مسارٍ يحفظ جلسة ← تسقط «لا جلسة بعد التسجيل».
//   B. جعل نسيان كلمة المرور يغيّر شيئاً في الجلسة ← تسقط «لا جلسة بعد الطلب».
//   D. إعادة مسار `/otp` أو شاشة الرمز إلى الموجِّه ← تسقط «لا مسار رمز».

import 'dart:async';
import 'dart:io';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/config/app_config.dart';
import 'package:otaku_galaxy/core/design_system/components/inputs/anime_text_field.dart';
import 'package:otaku_galaxy/core/design_system/components/inputs/gender_selector.dart';
import 'package:otaku_galaxy/core/design_system/themes/app_theme.dart';
import 'package:otaku_galaxy/core/di/injection_container.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/router/app_router.dart';
import 'package:otaku_galaxy/core/utils/iraqi_phone.dart';
import 'package:otaku_galaxy/features/auth/data/datasources/auth_local_storage.dart';
import 'package:otaku_galaxy/features/auth/domain/entities/account_request.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/change_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/forgot_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/get_me_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/login_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/register_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/update_profile_usecase.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_state.dart';
import 'package:otaku_galaxy/features/auth/presentation/screens/account_pending_screen.dart';
import 'package:otaku_galaxy/features/auth/presentation/widgets/auth_field.dart';
import 'package:otaku_galaxy/features/points/domain/entities/otaku_level.dart';
import 'package:otaku_galaxy/features/points/domain/repositories/points_repository.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/auth_stub.dart';

/// حرفٌ عربي خالص لا يُستعمل في السوراني — كاشف التسرّب.
final RegExp _arabicOnly = RegExp('[ةكيثذصضطظً-ْ]');

/// يسجّل ما أُرسل إلى الخادم.
class _RecordingRepo extends StubAuthRepository {
  _RecordingRepo(super.user);
  final List<Map<String, String>> registrations = [];
  final List<Map<String, String>> resets = [];

  @override
  Future<AccountRequestReceipt> register({
    required String username,
    required String phone,
    required String password,
    required String gender,
  }) async {
    registrations.add({'username': username, 'phone': phone, 'password': password, 'gender': gender});
    return const AccountRequestReceipt(id: 'req-reg', status: 'pending', createdAt: null);
  }

  @override
  Future<AccountRequestReceipt> forgotPassword({
    required String phone,
    required String username,
    required String gender,
    required String levelKey,
  }) async {
    resets.add({'phone': phone, 'username': username, 'gender': gender, 'levelKey': levelKey});
    return const AccountRequestReceipt(id: 'req-reset', status: 'pending', createdAt: null);
  }
}

/// لا جلسة محفوظة — زائرٌ يسجّل أو يستعيد كلمته.
class _GuestStorage implements AuthLocalStorage {
  @override
  bool get isLoggedIn => false;
  @override
  String? get token => null;
  @override
  String? getUserJson() => null;
  @override
  Future<void> load() async {}
  @override
  Future<void> saveSession(String token, String userJson) async {}
  @override
  Future<void> updateUser(String userJson) async {}
  @override
  Future<void> logout() async {}
}

class _Levels implements PointsRepository {
  @override
  Future<List<OtakuLevel>> fetchLevels() async => const [
    OtakuLevel(key: 'beginner', number: 1, nameMale: 'مبتدئ المجرة', nameFemale: 'مبتدئة المجرة', nameNeutral: 'المستوى المبتدئ', nameCkb: 'سەرەتایی گەلاکسی', reward: '', rewardKind: 'none', threshold: 0),
    OtakuLevel(key: 'explorer', number: 2, nameMale: 'مستكشف المجرة', nameFemale: 'مستكشفة المجرة', nameNeutral: 'مستوى الاستكشاف', nameCkb: 'گەڕیدەی گەلاکسی', reward: '', rewardKind: 'discount', threshold: 100),
  ];
  @override
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

class _Router extends RootStackRouter {
  @override
  List<AutoRoute> get routes => [
    AutoRoute(initial: true, path: '/home', page: PageInfo('HomePlaceholderRoute', builder: (_) => const Scaffold(body: SizedBox.shrink()))),
    AutoRoute(path: '/login', page: LoginRoute.page),
    AutoRoute(path: '/register', page: RegisterRoute.page),
    AutoRoute(path: '/forgot', page: ForgotPasswordRoute.page),
    AutoRoute(path: '/account-pending', page: AccountPendingRoute.page),
  ];
  @override
  RouteType get defaultRouteType => const RouteType.material();
}

AuthCubit _guestCubit(_RecordingRepo repo) => AuthCubit(
  localStorage: _GuestStorage(),
  loginUsecase: LoginUsecase(repo),
  registerUsecase: RegisterUsecase(repo),
  forgotPasswordUsecase: ForgotPasswordUsecase(repo),
  getMeUsecase: GetMeUsecase(repo),
  updateProfileUsecase: UpdateProfileUsecase(repo),
  changePasswordUsecase: ChangePasswordUsecase(repo),
);

Future<({_RecordingRepo repo, AuthCubit auth, _Router router})> _pump(
  WidgetTester tester, {
  required PageRouteInfo route,
  AppLanguage language = AppLanguage.arabic,
}) async {
  SharedPreferences.setMockInitialValues({'app_language_code': language.code});
  final prefs = await SharedPreferences.getInstance();
  final locale = LocaleCubit(prefs)..loadPreference();
  final repo = _RecordingRepo(stubUser(gender: null));
  final auth = _guestCubit(repo);
  await auth.loadSession();
  final router = _Router();
  addTearDown(locale.close);
  addTearDown(auth.close);
  tester.view.physicalSize = const Size(412, 1100);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MultiBlocProvider(
      providers: [
        BlocProvider<LocaleCubit>.value(value: locale),
        BlocProvider<AuthCubit>.value(value: auth),
      ],
      child: MaterialApp.router(
        theme: AppTheme.light,
        locale: language.locale,
        routerConfig: router.config(),
      ),
    ),
  );
  await tester.pump();
  router.push(route);
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 700));
  return (repo: repo, auth: auth, router: router);
}

/// الحقل بعنوانه. شاشة التسجيل تستعمل `AuthField` (عنوان فوق الحقل)،
/// وشاشة الاستعادة تستعمل `AnimeTextField` (العنوان داخل الحقل) — نبحث عن
/// أيّهما ثم نكتب في `TextFormField` الذي يبنيه.
Future<void> _type(WidgetTester tester, String label, String text) async {
  final wrapper = find.byWidgetPredicate(
    (w) => (w is AnimeTextField && w.label == label) || (w is AuthField && w.label == label),
  );
  expect(wrapper, findsOneWidget, reason: 'حقل «$label» غير موجود');
  await tester.enterText(
    find.descendant(of: wrapper, matching: find.byType(TextFormField)).first,
    text,
  );
}

Future<void> _tapButton(WidgetTester tester, String label) async {
  await tester.ensureVisible(find.text(label));
  await tester.tap(find.text(label));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 800));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    if (!sl.isRegistered<AppConfig>()) sl.registerLazySingleton<AppConfig>(() => AppConfig.development);
    if (sl.isRegistered<PointsRepository>()) sl.unregister<PointsRepository>();
    sl.registerLazySingleton<PointsRepository>(() => _Levels());
  });

  group('[CRITICAL] التسجيل — الاستمارة نفسها، طلبٌ لا رمز', () {
    testWidgets('الحقول الأربعة باقية كما كانت: الاسم، الرقم، كلمة المرور، الجنس', (tester) async {
      await _pump(tester, route: const RegisterRoute());
      final s = AppStrings.arabic;
      expect(find.text(s('username')), findsOneWidget);
      expect(find.text(s('phoneNumber')), findsOneWidget);
      expect(find.text(s('password')), findsOneWidget);
      expect(find.byType(GenderSelector), findsOneWidget);
      // ولا كلمة «رمز» على الزرّ.
      expect(find.text(s('submitRequest')), findsOneWidget);
      expect(find.textContaining('رمز'), findsNothing);
    });

    testWidgets('[TRIPWIRE A] الإرسال يفتح «قيد المراجعة» ولا يحفظ جلسة', (tester) async {
      final h = await _pump(tester, route: const RegisterRoute());
      final s = AppStrings.arabic;
      await _type(tester, s('username'), 'زبون جديد');
      await _type(tester, s('phoneNumber'), '07701234567');
      await _type(tester, s('password'), 'secret123');
      await tester.tap(find.text(s('genderMale')));
      await tester.pump();
      await _tapButton(tester, s('submitRequest'));

      expect(h.repo.registrations, hasLength(1));
      expect(h.repo.registrations.single['gender'], 'male');
      // الشاشة التالية: قيد المراجعة — بالنصّ المطلوب حرفياً.
      expect(find.byType(AccountPendingScreen), findsOneWidget);
      expect(find.text('سيتم التواصل معك من قبل الإدارة لتأكيد إنشاء الحساب.'), findsOneWidget);
      expect(find.text(s('pendingAdminReview')), findsOneWidget);
      // لا جلسة: التسجيل لا يصادق.
      expect(h.auth.state, isA<AuthUnauthenticated>());
      expect(h.auth.isLoggedIn, isFalse);
      // ولا شاشة رمز ولا حقل رمز.
      expect(find.textContaining('رمز التحقق'), findsNothing);
      expect(h.router.stack.map((r) => r.name), isNot(contains('OtpVerificationRoute')));
    });

    testWidgets('[CRITICAL] كردي: الشاشة كلّها كردية — لا حرف عربي خالص', (tester) async {
      final h = await _pump(tester, route: const RegisterRoute(), language: AppLanguage.kurdish);
      final k = AppStrings.kurdish;
      await _type(tester, k('username'), 'کڕیاری نوێ');
      await _type(tester, k('phoneNumber'), '07701234567');
      await _type(tester, k('password'), 'secret123');
      await tester.tap(find.text(k('genderFemale')));
      await tester.pump();
      await _tapButton(tester, k('submitRequest'));
      expect(h.repo.registrations.single['gender'], 'female');
      expect(find.byType(AccountPendingScreen), findsOneWidget);
      final leaked = tester.widgetList<Text>(find.byType(Text)).map((t) => t.data ?? '').where(_arabicOnly.hasMatch).toList();
      expect(leaked, isEmpty, reason: 'تسرّب عربي في شاشة الانتظار الكردية: $leaked');
      expect(find.text(k('accountPendingBody')), findsOneWidget);
    });
  });

  group('[CRITICAL] نسيت كلمة المرور — أربع معلومات، طلبٌ لا رمز', () {
    testWidgets('[TRIPWIRE B] الرقم + الاسم + الجنس + المستوى ← طلب معلَّق، ولا جلسة ولا تغيير', (tester) async {
      final h = await _pump(tester, route: const ForgotPasswordRoute());
      final s = AppStrings.arabic;
      expect(find.text(s('accountLevel')), findsOneWidget);
      expect(find.byType(GenderSelector), findsOneWidget);
      expect(find.textContaining('رمز التحقق'), findsNothing);

      await _type(tester, s('phoneNumber'), '07701234567');
      await _type(tester, s('username'), 'مختبر');
      await tester.tap(find.text(s('genderMale')));
      await tester.pump();
      // اختيار المستوى من الورقة.
      await tester.ensureVisible(find.text(s('chooseAccountLevel')).first);
      await tester.tap(find.text(s('chooseAccountLevel')).first);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      await tester.tap(find.textContaining('الاستكشاف').last);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      await _tapButton(tester, s('submitRequest'));

      expect(h.repo.resets, hasLength(1));
      // الرقم يصل بصيغة E.164 المطبَّعة — ما يخزّنه الخادم، لا كما كُتب.
      expect(h.repo.resets.single, {'phone': '+9647701234567', 'username': 'مختبر', 'gender': 'male', 'levelKey': 'explorer'});
      expect(find.byType(AccountPendingScreen), findsOneWidget);
      expect(find.text('سيتم التواصل معك من قبل الإدارة لإعادة تعيين كلمة المرور.'), findsOneWidget);
      // لا جلسة ولا حقل كلمة مرور جديدة: الإدارة تضعها.
      expect(h.auth.state, isA<AuthUnauthenticated>());
      expect(find.text(s('newPassword')), findsNothing);
    });

    testWidgets('بلا مستوى لا يُرسل شيء — رسالة تحقق', (tester) async {
      final h = await _pump(tester, route: const ForgotPasswordRoute());
      final s = AppStrings.arabic;
      await _type(tester, s('phoneNumber'), '07701234567');
      await _type(tester, s('username'), 'مختبر');
      await tester.tap(find.text(s('genderMale')));
      await tester.pump();
      await _tapButton(tester, s('submitRequest'));
      expect(h.repo.resets, isEmpty);
      expect(find.text(s('accountLevelRequired')), findsOneWidget);
    });

    testWidgets('[CRITICAL] كردي: الاستمارة وشاشة الانتظار بلا تسرّب', (tester) async {
      final h = await _pump(tester, route: const ForgotPasswordRoute(), language: AppLanguage.kurdish);
      final k = AppStrings.kurdish;
      final leakedForm = tester.widgetList<Text>(find.byType(Text)).map((t) => t.data ?? '').where(_arabicOnly.hasMatch).toList();
      expect(leakedForm, isEmpty, reason: 'تسرّب عربي في استمارة كردية: $leakedForm');
      await _type(tester, k('phoneNumber'), '07701234567');
      await _type(tester, k('username'), 'تاقیکار');
      await tester.tap(find.text(k('genderFemale')));
      await tester.pump();
      await tester.ensureVisible(find.text(k('chooseAccountLevel')).first);
      await tester.tap(find.text(k('chooseAccountLevel')).first);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      await tester.tap(find.textContaining('گەڕیدەی').last);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      await _tapButton(tester, k('submitRequest'));
      expect(h.repo.resets.single['levelKey'], 'explorer');
      expect(find.byType(AccountPendingScreen), findsOneWidget);
      final leaked = tester.widgetList<Text>(find.byType(Text)).map((t) => t.data ?? '').where(_arabicOnly.hasMatch).toList();
      expect(leaked, isEmpty, reason: 'تسرّب عربي في شاشة الانتظار الكردية: $leaked');
    });
  });

  // [CRITICAL REGRESSION GUARD] (2026-09-27) لا بادئة `07` ثابتة في الحقل.
  //
  // كان الحقل يعرض `07` ثابتةً (§49.2) ويأخذ التسعة التي تليها. الآن يكتب
  // الزبون رقمه كاملاً — `07` ضمناً — والقاعدة كما هي: موبايل عراقي 075–079،
  // يصل الخادمَ مطبَّعاً `+9647XXXXXXXXX`. هنا الشاشتان الحقيقيتان: ما يظهر
  // في الحقل وما يصل إلى الخادم.
  group('[CRITICAL] حقل الهاتف: الرقم كاملاً بلا بادئة ثابتة، والقاعدة العراقية كما هي', () {
    const accepted = <String, String>{
      '07701234567': '+9647701234567',
      '07501234567': '+9647501234567',
      '07991234567': '+9647991234567',
      '٠٧٧٠١٢٣٤٥٦٧': '+9647701234567',
      '0770 123 4567': '+9647701234567',
    };

    TextField phoneField(WidgetTester tester, String label) => tester.widget<TextField>(
      find.descendant(
        of: find.byWidgetPredicate((w) => w is AnimeTextField && w.label == label),
        matching: find.byType(TextField),
      ),
    );

    testWidgets('[CRITICAL] الحقل فارغ بلا بادئة، و«7» لا تصير «07»', (tester) async {
      await _pump(tester, route: const RegisterRoute());
      final s = AppStrings.arabic;
      var field = phoneField(tester, s('phoneNumber'));
      expect(field.controller!.text, isEmpty);
      expect(field.decoration!.prefixText, isNull);
      expect(field.decoration!.prefix, isNull);
      expect(field.decoration!.hintText, 'أدخل رقم الهاتف');
      expect(field.keyboardType, TextInputType.phone);
      await _type(tester, s('phoneNumber'), '7');
      await tester.pump();
      field = phoneField(tester, s('phoneNumber'));
      expect(field.controller!.text, '7');
    });

    for (final entry in accepted.entries) {
      testWidgets('التسجيل: «${entry.key}» ← يُرسل ${entry.value}', (tester) async {
        final h = await _pump(tester, route: const RegisterRoute());
        final s = AppStrings.arabic;
        await _type(tester, s('phoneNumber'), entry.key);
        await tester.pump();
        final field = phoneField(tester, s('phoneNumber'));
        // الحقل يعرض الرقم كاملاً كما كُتب (أرقاماً غربية بلا فواصل).
        expect(field.controller!.text, iraqiPhoneInputText(entry.key), reason: entry.key);
        expect(field.controller!.text, startsWith('07'), reason: entry.key);

        await _type(tester, s('username'), 'زبون جديد');
        await _type(tester, s('password'), 'secret123');
        await tester.tap(find.text(s('genderMale')));
        await tester.pump();
        await _tapButton(tester, s('submitRequest'));
        expect(h.repo.registrations.single['phone'], entry.value, reason: entry.key);
      });
    }

    testWidgets('نسيت كلمة المرور: الحقل نفسه بلا بادئة، والرقم الكامل يصل مطبَّعاً', (tester) async {
      final h = await _pump(tester, route: const ForgotPasswordRoute());
      final s = AppStrings.arabic;
      final field = phoneField(tester, s('phoneNumber'));
      expect(field.decoration!.prefixText, isNull);
      expect(field.decoration!.hintText, 'أدخل رقم الهاتف');
      await _type(tester, s('phoneNumber'), '07801234567');
      await _type(tester, s('username'), 'مختبر');
      await tester.tap(find.text(s('genderMale')));
      await tester.pump();
      await tester.ensureVisible(find.text(s('chooseAccountLevel')).first);
      await tester.tap(find.text(s('chooseAccountLevel')).first);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      await tester.tap(find.textContaining('الاستكشاف').last);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      await _tapButton(tester, s('submitRequest'));
      expect(h.repo.resets.single['phone'], '+9647801234567');
    });

    testWidgets('[CRITICAL] بلا 07، ناقص، 070، أرضي، أو أجنبي — لا يُرسل', (tester) async {
      final h = await _pump(tester, route: const RegisterRoute());
      final s = AppStrings.arabic;
      await _type(tester, s('username'), 'زبون جديد');
      await _type(tester, s('password'), 'secret123');
      await tester.tap(find.text(s('genderMale')));
      await tester.pump();
      for (final bad in [
        '7701234567', // الرقم بلا 07 — لا تُضاف عنه.
        '7701234',
        '0770123456',
        '07001234567',
        '0662251234', // أرضي.
        '+447700900123', // أجنبي.
        '+9647701234567', // الحقل للصيغة المحلية 07…
      ]) {
        await _type(tester, s('phoneNumber'), bad);
        await _tapButton(tester, s('submitRequest'));
        expect(h.repo.registrations, isEmpty, reason: bad);
        expect(find.text(s('phoneInvalid')), findsOneWidget, reason: bad);
      }
    });
  });

  group('[TRIPWIRE D] لا مسار رمز SMS في التطبيق', () {
    test('الموجِّه لا يعرف /otp ولا /reset-password ولا شاشتيهما', () {
      final router = File('lib/core/router/app_router.dart').readAsStringSync();
      final generated = File('lib/core/router/app_router.gr.dart').readAsStringSync();
      for (final src in [router, generated]) {
        expect(src, isNot(contains('OtpVerificationRoute')));
        expect(src, isNot(contains('ResetPasswordRoute')));
        expect(src, isNot(contains("'/otp'")));
      }
      expect(File('lib/features/auth/presentation/screens/otp_verification_screen.dart').existsSync(), isFalse);
      expect(File('lib/features/auth/presentation/screens/reset_password_screen.dart').existsSync(), isFalse);
      expect(File('lib/features/auth/presentation/widgets/otp_code_field.dart').existsSync(), isFalse);
      // محفوظة خارج البناء لا محذوفة.
      expect(File('legacy/otp/flutter/screens/otp_verification_screen.dart.legacy').existsSync(), isTrue);
    });

    test('لا نقطة رمز في ApiEndpoints ولا في AuthRepository', () {
      final endpoints = File('lib/core/constants/api_endpoints.dart').readAsStringSync();
      final repo = File('lib/features/auth/domain/repositories/auth_repository.dart').readAsStringSync();
      final cubit = File('lib/features/auth/presentation/cubit/auth_cubit.dart').readAsStringSync();
      for (final src in [endpoints, repo, cubit]) {
        expect(src, isNot(contains('verify')));
        expect(src, isNot(contains('resend-code')));
        expect(src, isNot(contains('reset-password')));
        expect(src, isNot(contains('Otp')));
      }
    });

    test('لا حالة «كلمة مؤقّتة» ولا «يجب التغيير» في نموذج المستخدم', () {
      final user = File('lib/features/auth/domain/entities/user.dart').readAsStringSync();
      expect(user, isNot(matches(RegExp(r'mustChange|temporary|forceChange|passwordExpir', caseSensitive: false))));
    });
  });

  group('شاشة الانتظار', () {
    testWidgets('نصّان مختلفان للنوعين، وزرّ العودة لتسجيل الدخول', (tester) async {
      await _pump(tester, route: AccountPendingRoute(kind: AccountRequestKind.registration));
      final s = AppStrings.arabic;
      expect(find.text(s('accountPendingTitle')), findsOneWidget);
      expect(find.text(s('stepAdminApprovesAccount')), findsOneWidget);
      expect(find.text(s('backToLogin')), findsOneWidget);
      // لا جملة عن «رمز تحقق» — لا نفياً ولا إثباتاً: المفهوم أُزيل كلياً
      // من الشاشتين بطلب المنتج (2026-09-13)، والمفتاح `noSmsCodeNeeded` معه.
      expect(find.textContaining('رمز تحقق'), findsNothing);
      expect(find.textContaining('رمز التحقق'), findsNothing);
    });

    testWidgets('إعادة التعيين: الخطوة تقول إن الإدارة تضع الكلمة وأنها دائمة', (tester) async {
      await _pump(tester, route: AccountPendingRoute(kind: AccountRequestKind.passwordReset));
      final s = AppStrings.arabic;
      expect(find.text(s('resetPendingTitle')), findsOneWidget);
      expect(find.text(s('stepAdminSetsPassword')), findsOneWidget);
      expect(find.text(s('stepLoginWithNewPassword')), findsOneWidget);
    });
  });
}
