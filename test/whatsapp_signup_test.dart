// التسجيل عبر واتساب (WHATSAPP_VERIFY_MODE=auto) — آلة الحالات والشاشة.
//
// المزوّد والخادم مزيَّفان: لا شبكة ولا منصّة. ما يُثبَت:
//   - الحالة تأتي من الخادم، والاستعلام يتوقّف عند حالةٍ نهائية ويُستأنف عند العودة.
//   - كلمة المرور لا تُطلب قبل «تحقّق»؛ الإكمال يسلّم الجلسة لمكعّب المصادقة.
//   - الجلسة تُحفظ وتُستأنف بعد إغلاق النظام للتطبيق، وتُمسح عند النهاية.
//   - الوضع off (أو خادمٌ أقدم): شاشة التسجيل كما هي حرفياً — لا زرّ واتساب.
//   - البديل الإداري ظاهرٌ في كل خطوة.

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/themes/app_theme.dart';
import 'package:otaku_galaxy/core/di/injection_container.dart';
import 'package:otaku_galaxy/core/errors/app_exception.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';
import 'package:otaku_galaxy/features/auth/domain/entities/account_request.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/change_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/forgot_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/get_me_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/login_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/register_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/update_profile_usecase.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/auth/presentation/screens/register_screen.dart';
import 'package:otaku_galaxy/features/auth/domain/entities/auth_session.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:otaku_galaxy/features/whatsapp_signup/data/whatsapp_signup_repository.dart';
import 'package:otaku_galaxy/features/whatsapp_signup/data/whatsapp_signup_store.dart';
import 'package:otaku_galaxy/features/whatsapp_signup/domain/whatsapp_signup_models.dart';
import 'package:otaku_galaxy/features/whatsapp_signup/presentation/whatsapp_signup_cubit.dart';
import 'package:otaku_galaxy/features/whatsapp_signup/presentation/whatsapp_signup_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/auth_stub.dart';
import 'support/render_harness.dart';

class _FakeRepo implements WhatsAppSignupRepository {
  WhatsAppSignupOptions optionsValue = WhatsAppSignupOptions.disabled;
  final List<WhatsAppSignupStatus> statuses = [];
  AppException? statusError;
  AppException? completeError;
  AppException? startError;
  int statusCalls = 0;
  final List<String> started = [];
  final List<Map<String, String>> completed = [];

  @override
  Future<WhatsAppSignupOptions> options() async => optionsValue;

  @override
  Future<WhatsAppSignupSession> start(String phone) async {
    started.add(phone);
    final error = startError;
    if (error != null) throw error;
    return WhatsAppSignupSession(
      sessionId: 'sid-1',
      secret: 'S' * 43,
      code: 'OG-AB12C-DE34F',
      waLink: 'https://wa.me/9647500000000?text=OG-AB12C-DE34F',
      businessNumber: '+9647500000000',
      expiresAt: DateTime.now().add(const Duration(minutes: 5)),
      phone: phone,
    );
  }

  @override
  Future<WhatsAppSignupStatus> status(WhatsAppSignupSession session) async {
    statusCalls++;
    final error = statusError;
    if (error != null) throw error;
    return statuses.isEmpty
        ? const WhatsAppSignupStatus(phase: WhatsAppSignupPhase.pending)
        : statuses.removeAt(0);
  }

  @override
  Future<AuthSession> complete(
    WhatsAppSignupSession session, {
    required String username,
    required String gender,
    required String password,
  }) async {
    final error = completeError;
    if (error != null) throw error;
    completed.add({
      'username': username,
      'gender': gender,
      'password': password,
    });
    return AuthSession(
      token: 'jwt',
      user: stubUser(gender: gender),
    );
  }
}

/// يسجّل طلب الحساب الإداري ثم يرفض — فلا تنتقل الشاشة (لا موجّه في الاختبار).
class _RecordingAuthRepo extends StubAuthRepository {
  _RecordingAuthRepo() : super(stubUser());

  final List<Map<String, String>> registered = [];

  @override
  Future<AccountRequestReceipt> register({
    required String username,
    required String phone,
    required String password,
    required String gender,
  }) async {
    registered.add({
      'username': username,
      'phone': phone,
      'password': password,
      'gender': gender,
    });
    throw const AppException('stop-before-navigation', statusCode: 400);
  }
}

/// خادمٌ يردّ بمغلّف خطأ ثابت — لفحص ما يقرؤه `ApiClient` منه.
class _ErrorAdapter implements HttpClientAdapter {
  _ErrorAdapter(this.status, this.body);
  final int status;
  final Map<String, Object?> body;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async => ResponseBody.fromString(
    jsonEncode(body),
    status,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );

  @override
  void close({bool force = false}) {}
}

WhatsAppSignupCubit _cubit(
  _FakeRepo repo,
  MemoryWhatsAppSignupStore store,
  List<AuthSession> adopted,
) => WhatsAppSignupCubit(
  repository: repo,
  store: store,
  onSession: (s) async => adopted.add(s),
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // الخطوط الحقيقية: `BoundedText` في رأس المصادقة والأزرار يقيس عرض النصّ.
  setUpAll(loadProjectFonts);

  group('آلة الحالات', () {
    testWidgets('البدء يحفظ الجلسة ويستعلم دورياً حتى «تحقّق» ثم يتوقّف', (
      tester,
    ) async {
      final repo = _FakeRepo()
        ..statuses.addAll(const [
          WhatsAppSignupStatus(phase: WhatsAppSignupPhase.pending),
          WhatsAppSignupStatus(phase: WhatsAppSignupPhase.verified),
        ]);
      final store = MemoryWhatsAppSignupStore();
      final cubit = _cubit(repo, store, []);

      await cubit.startSession('+9647701234567');
      expect(cubit.state.step, WhatsAppSignupStep.waiting);
      expect(store.value?.sessionId, 'sid-1');

      await tester.pump(WhatsAppSignupCubit.fastInterval);
      await tester.pump();
      expect(repo.statusCalls, 1);
      expect(cubit.state.step, WhatsAppSignupStep.waiting);
      await tester.pump(WhatsAppSignupCubit.fastInterval);
      await tester.pump();
      expect(cubit.state.step, WhatsAppSignupStep.details);

      // لا استعلام بعد «تحقّق».
      await tester.pump(const Duration(seconds: 30));
      expect(repo.statusCalls, 2);
      await cubit.close();
    });

    testWidgets('الغياب يوقف الاستعلام؛ العودة تستعلم فوراً', (tester) async {
      final repo = _FakeRepo();
      final cubit = _cubit(repo, MemoryWhatsAppSignupStore(), []);
      await cubit.startSession('+9647701234567');
      cubit.pause();
      await tester.pump(const Duration(seconds: 20));
      expect(repo.statusCalls, 0);
      repo.statuses.add(
        const WhatsAppSignupStatus(phase: WhatsAppSignupPhase.verified),
      );
      await cubit.resume();
      expect(repo.statusCalls, 1);
      expect(cubit.state.step, WhatsAppSignupStep.details);
      await cubit.close();
    });

    testWidgets(
      'حالةٌ نهائية (انتهت، رقمٌ آخر) تمسح الجلسة المحفوظة وتوقف الاستعلام',
      (tester) async {
        for (final phase in [
          WhatsAppSignupPhase.expired,
          WhatsAppSignupPhase.mismatch,
          WhatsAppSignupPhase.phoneTaken,
        ]) {
          final repo = _FakeRepo()
            ..statuses.add(WhatsAppSignupStatus(phase: phase));
          final store = MemoryWhatsAppSignupStore();
          final cubit = _cubit(repo, store, []);
          await cubit.startSession('+9647701234567');
          await cubit.refresh();
          expect(cubit.state.phase, phase);
          expect(store.value, isNull, reason: '$phase');
          await tester.pump(const Duration(seconds: 30));
          expect(repo.statusCalls, 1, reason: '$phase');
          await cubit.close();
        }
      },
    );

    testWidgets(
      'محاولةٌ من رقمٍ آخر تُعرض ولا تُنهي الانتظار؛ «مشاركة الرقم» حالةٌ قائمة',
      (tester) async {
        final repo = _FakeRepo()
          ..statuses.addAll(const [
            WhatsAppSignupStatus(
              phase: WhatsAppSignupPhase.pending,
              lastAttemptMismatched: true,
            ),
            WhatsAppSignupStatus(phase: WhatsAppSignupPhase.awaitingContact),
          ]);
        final cubit = _cubit(repo, MemoryWhatsAppSignupStore(), []);
        await cubit.startSession('+9647701234567');
        await cubit.refresh();
        expect(cubit.state.mismatched, isTrue);
        expect(cubit.state.step, WhatsAppSignupStep.waiting);
        await cubit.refresh();
        expect(cubit.state.phase, WhatsAppSignupPhase.awaitingContact);
        expect(cubit.state.step, WhatsAppSignupStep.waiting);
        await cubit.close();
      },
    );

    testWidgets('ثلاثة إخفاقات شبكة: شريط «لا اتصال»، والاستعلام مستمرّ', (
      tester,
    ) async {
      final repo = _FakeRepo()..statusError = const AppException('offline');
      final cubit = _cubit(repo, MemoryWhatsAppSignupStore(), []);
      await cubit.startSession('+9647701234567');
      for (var i = 0; i < 3; i++) {
        await cubit.refresh();
      }
      expect(cubit.state.offline, isTrue);
      repo.statusError = null;
      await cubit.refresh();
      expect(cubit.state.offline, isFalse);
      await cubit.close();
    });

    testWidgets(
      'الجلسة المحفوظة تُستأنف بعد إغلاق التطبيق؛ القديمة جداً تُمسح',
      (tester) async {
        final repo = _FakeRepo()
          ..statuses.add(
            const WhatsAppSignupStatus(phase: WhatsAppSignupPhase.verified),
          );
        final store = MemoryWhatsAppSignupStore()
          ..value = await repo.start('+9647701234567');
        final cubit = _cubit(repo, store, []);
        await cubit.restore();
        expect(cubit.state.step, WhatsAppSignupStep.details);

        final stale = MemoryWhatsAppSignupStore()
          ..value = WhatsAppSignupSession(
            sessionId: 'old',
            secret: 'S' * 43,
            code: 'OG-X',
            waLink: 'https://wa.me/1',
            businessNumber: '+9647500000000',
            expiresAt: DateTime.now().subtract(const Duration(hours: 1)),
            phone: '07701234567',
          );
        final second = _cubit(_FakeRepo(), stale, []);
        await second.restore();
        expect(second.state.step, WhatsAppSignupStep.phone);
        expect(stale.value, isNull);
        await cubit.close();
        await second.close();
      },
    );

    testWidgets(
      '[SECURITY] الإكمال قبل الجلسة لا يرسل شيئاً؛ بعدها يسلّم الجلسة ويمسح المحفوظ',
      (tester) async {
        final repo = _FakeRepo()
          ..statuses.add(
            const WhatsAppSignupStatus(phase: WhatsAppSignupPhase.verified),
          );
        final store = MemoryWhatsAppSignupStore();
        final adopted = <AuthSession>[];
        final cubit = _cubit(repo, store, adopted);
        await cubit.complete(
          username: 'x',
          gender: 'male',
          password: 'secret123',
        );
        expect(repo.completed, isEmpty);

        await cubit.startSession('+9647701234567');
        await cubit.refresh();
        await cubit.complete(
          username: 'زبون',
          gender: 'female',
          password: 'secret123',
        );
        expect(repo.completed.single, {
          'username': 'زبون',
          'gender': 'female',
          'password': 'secret123',
        });
        expect(adopted.single.token, 'jwt');
        expect(store.value, isNull);
        expect(cubit.state.step, WhatsAppSignupStep.done);
        await cubit.close();
      },
    );

    testWidgets(
      'رفض الإكمال (الرقم مأخوذ، انتهت) يعيد إلى حالةٍ نهائية بلا جلسة',
      (tester) async {
        final repo = _FakeRepo()
          ..statuses.add(
            const WhatsAppSignupStatus(phase: WhatsAppSignupPhase.verified),
          )
          ..completeError = const AppException(
            'taken',
            statusCode: 409,
            code: 'PHONE_TAKEN',
          );
        final adopted = <AuthSession>[];
        final cubit = _cubit(repo, MemoryWhatsAppSignupStore(), adopted);
        await cubit.startSession('+9647701234567');
        await cubit.refresh();
        await cubit.complete(
          username: 'زبون',
          gender: 'male',
          password: 'secret123',
        );
        expect(cubit.state.phase, WhatsAppSignupPhase.phoneTaken);
        expect(cubit.state.step, WhatsAppSignupStep.waiting);
        expect(adopted, isEmpty);
        await cubit.close();
      },
    );

    for (final code in ['ACCOUNT_REQUEST_REJECTED', 'ACCOUNT_SUSPENDED']) {
      testWidgets(
        'قرار المسؤول ($code): الجلسة تُمسح وتنتهي، ورسالة الخادم ظاهرة',
        (tester) async {
          final repo = _FakeRepo()
            ..statuses.add(
              const WhatsAppSignupStatus(phase: WhatsAppSignupPhase.verified),
            )
            ..completeError = AppException(
              'رسالة الخادم',
              statusCode: 403,
              code: code,
            );
          final store = MemoryWhatsAppSignupStore();
          final adopted = <AuthSession>[];
          final cubit = _cubit(repo, store, adopted);
          await cubit.startSession('+9647701234567');
          await cubit.refresh();
          await cubit.complete(
            username: 'زبون',
            gender: 'male',
            password: 'secret123',
          );
          expect(cubit.state.phase, WhatsAppSignupPhase.dead);
          expect(cubit.state.step, WhatsAppSignupStep.waiting);
          expect(cubit.state.error?.code, code);
          expect(store.value, isNull);
          expect(adopted, isEmpty);
          await cubit.close();
        },
      );
    }
  });

  group('الشاشة', () {
    Future<_FakeRepo> pumpScreen(
      WidgetTester tester, {
      _FakeRepo? repo,
      AppLanguage language = AppLanguage.arabic,
    }) async {
      SharedPreferences.setMockInitialValues({
        'app_language_code': language.code,
      });
      final prefs = await SharedPreferences.getInstance();
      final locale = LocaleCubit(prefs)..loadPreference();
      addTearDown(locale.close);
      tester.view.physicalSize = const Size(412, 1400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      final r = repo ?? _FakeRepo();
      await tester.pumpWidget(
        BlocProvider<LocaleCubit>.value(
          value: locale,
          child: MaterialApp(
            theme: AppTheme.light,
            locale: language.locale,
            home: WhatsAppSignupScreen(
              initialPhone: '07701234567',
              repository: r,
              store: MemoryWhatsAppSignupStore(),
              openLink: (_) async => false,
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
      return r;
    }

    testWidgets(
      'الرقم ← الرمز وزرّ واتساب والتحذير ← البيانات بعد التحقق؛ البديل الإداري ظاهر',
      (tester) async {
        final repo = await pumpScreen(tester);
        final s = AppStrings.arabic;
        expect(find.byKey(const Key('waSignupManual')), findsOneWidget);
        expect(find.byKey(const Key('waSignupPassword')), findsNothing);

        await tester.tap(find.byKey(const Key('waSignupStart')));
        await tester.pump();
        await tester.pump();
        expect(repo.started.single, '+9647701234567');
        expect(find.text('OG-AB12C-DE34F'), findsOneWidget);
        expect(find.byKey(const Key('waSignupOpen')), findsOneWidget);
        expect(find.text(s('waSignupWarning')), findsOneWidget);
        // كلمة المرور لا تُطلب أثناء الانتظار.
        expect(find.byKey(const Key('waSignupPassword')), findsNothing);
        expect(find.byKey(const Key('waSignupManual')), findsOneWidget);

        // واتساب لا يُفتح ← رسالةٌ برقم المتجر.
        await tester.tap(find.byKey(const Key('waSignupOpen')));
        await tester.pump();
        expect(find.textContaining('+9647500000000'), findsWidgets);

        repo.statuses.add(
          const WhatsAppSignupStatus(phase: WhatsAppSignupPhase.verified),
        );
        await tester.pump(WhatsAppSignupCubit.fastInterval);
        await tester.pump();
        expect(find.byKey(const Key('waSignupVerified')), findsOneWidget);
        expect(find.byKey(const Key('waSignupPassword')), findsOneWidget);
        await tester.pumpWidget(const SizedBox());
      },
    );

    testWidgets(
      '[STEP 84/85] خطوة البيانات: سياسة كلمة المرور نفسها — رقم الجلسة يُرفض عند الحقل ولا يُرسل',
      (tester) async {
        final repo = await pumpScreen(tester);
        await tester.tap(find.byKey(const Key('waSignupStart')));
        await tester.pump();
        await tester.pump();
        repo.statuses.add(
          const WhatsAppSignupStatus(phase: WhatsAppSignupPhase.verified),
        );
        await tester.pump(WhatsAppSignupCubit.fastInterval);
        await tester.pump();
        await tester.enterText(find.byKey(const Key('waSignupUsername')), 'زبون جديد');
        await tester.enterText(find.byKey(const Key('waSignupPassword')), 'og77012345678');
        await tester.tap(find.text(AppStrings.arabic('genderMale')));
        await tester.pump();
        await tester.ensureVisible(find.byKey(const Key('waSignupCreate')));
        await tester.tap(find.byKey(const Key('waSignupCreate')));
        await tester.pump();
        expect(find.text(AppStrings.arabic('passwordContainsPhone')), findsOneWidget);
        expect(repo.completed, isEmpty);
        await tester.pumpWidget(const SizedBox());
      },
    );

    testWidgets('حالة «مشاركة الرقم» ومحاولة الرقم الآخر تُعرضان بنصّهما', (
      tester,
    ) async {
      final repo = _FakeRepo()
        ..statuses.addAll(const [
          WhatsAppSignupStatus(
            phase: WhatsAppSignupPhase.pending,
            lastAttemptMismatched: true,
          ),
          WhatsAppSignupStatus(phase: WhatsAppSignupPhase.awaitingContact),
        ]);
      await pumpScreen(tester, repo: repo);
      final s = AppStrings.arabic;
      await tester.tap(find.byKey(const Key('waSignupStart')));
      await tester.pump();
      await tester.pump(WhatsAppSignupCubit.fastInterval);
      await tester.pump();
      expect(find.text(s('waSignupMismatch')), findsOneWidget);
      await tester.pump(WhatsAppSignupCubit.fastInterval);
      await tester.pump();
      expect(find.text(s('waSignupShareContact')), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('انتهاء المهلة: نصّها وزرّ البدء من جديد', (tester) async {
      final repo = _FakeRepo()
        ..statuses.add(
          const WhatsAppSignupStatus(phase: WhatsAppSignupPhase.expired),
        );
      await pumpScreen(tester, repo: repo);
      await tester.tap(find.byKey(const Key('waSignupStart')));
      await tester.pump();
      await tester.pump(WhatsAppSignupCubit.fastInterval);
      await tester.pump();
      expect(find.text(AppStrings.arabic('waSignupExpired')), findsOneWidget);
      await tester.tap(find.byKey(const Key('waSignupRestart')));
      await tester.pump();
      expect(find.byKey(const Key('waSignupStart')), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('الكردية: كل نصوص الشاشة من المسرد الكردي', (tester) async {
      await pumpScreen(tester, language: AppLanguage.kurdish);
      final k = AppStrings.kurdish;
      expect(find.text(k('waSignupTitle')), findsWidgets);
      await tester.tap(find.byKey(const Key('waSignupStart')));
      await tester.pump();
      await tester.pump();
      expect(find.text(k('waSignupWarning')), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });
  });

  group('[STEP 85] شاشة التسجيل — الطريقان', () {
    Future<(_FakeRepo, _RecordingAuthRepo)> pumpRegister(
      WidgetTester tester, {
      required bool enabled,
    }) async {
      tester.view.physicalSize = const Size(430, 1600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      final wa = _FakeRepo()
        ..optionsValue = enabled
            ? const WhatsAppSignupOptions(
                enabled: true,
                businessNumber: '+9647500000000',
              )
            : WhatsAppSignupOptions.disabled;
      sl.registerSingleton<WhatsAppSignupRepository>(wa);
      addTearDown(() => sl.unregister<WhatsAppSignupRepository>());
      final auth = _RecordingAuthRepo();
      final cubit = AuthCubit(
        localStorage: InMemoryAuthStorage(stubUser()),
        loginUsecase: LoginUsecase(auth),
        registerUsecase: RegisterUsecase(auth),
        forgotPasswordUsecase: ForgotPasswordUsecase(auth),
        getMeUsecase: GetMeUsecase(auth),
        updateProfileUsecase: UpdateProfileUsecase(auth),
        changePasswordUsecase: ChangePasswordUsecase(auth),
      );
      addTearDown(cubit.close);
      await tester.pumpWidget(
        BlocProvider<AuthCubit>.value(
          value: cubit,
          child: MaterialApp(
            theme: AppTheme.light,
            home: const Directionality(
              textDirection: TextDirection.rtl,
              child: RegisterScreen(),
            ),
          ),
        ),
      );
      await tester.pump(const Duration(seconds: 1));
      return (wa, auth);
    }

    testWidgets(
      'auto: الطريقان ظاهران بالقدر نفسه قبل أي استمارة — واتساب و«المتابعة بدون واتساب»',
      (tester) async {
        await pumpRegister(tester, enabled: true);
        final s = AppStrings.arabic;
        expect(find.byKey(const Key('registerChooseMethod')), findsOneWidget);
        expect(find.byKey(const Key('registerWithWhatsApp')), findsOneWidget);
        expect(find.byKey(const Key('registerWithoutWhatsApp')), findsOneWidget);
        expect(find.text(s('regContinueWithoutWhatsApp')), findsOneWidget);
        expect(find.text(s('regPathWhatsAppHint')), findsOneWidget);
        expect(find.text(s('regPathManualHint')), findsOneWidget);
        // لا استمارة قبل الاختيار.
        expect(find.byType(TextField), findsNothing);
      },
    );

    testWidgets(
      '[CRITICAL] «المتابعة بدون واتساب»: الاستمارة الإدارية نفسها، وتُرسل طلباً بلا أي خطوة واتساب',
      (tester) async {
        final (wa, auth) = await pumpRegister(tester, enabled: true);
        await tester.tap(find.byKey(const Key('registerWithoutWhatsApp')));
        await tester.pump();
        expect(find.byKey(const Key('registerManualNotice')), findsOneWidget);
        expect(find.byKey(const Key('registerSwitchToWhatsApp')), findsOneWidget);
        expect(find.byKey(const Key('registerWithWhatsApp')), findsNothing);
        final fields = find.byType(TextField);
        expect(fields, findsNWidgets(3));
        await tester.enterText(fields.at(0), 'بلا واتساب');
        await tester.enterText(fields.at(1), '07701234567');
        await tester.enterText(fields.at(2), 'secret-pass-1');
        await tester.tap(find.text(AppStrings.arabic('genderMale')));
        await tester.pump();
        await tester.tap(find.text(AppStrings.arabic('submitRequest')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(auth.registered, [
          {
            'username': 'بلا واتساب',
            'phone': '+9647701234567',
            'password': 'secret-pass-1',
            'gender': 'male',
          },
        ]);
        expect(wa.started, isEmpty);
        await tester.pumpWidget(const SizedBox());
        await tester.pump(const Duration(seconds: 5));
      },
    );

    testWidgets('off: لا اختيار ولا زرّ واتساب — الاستمارة مباشرةً كما كانت', (
      tester,
    ) async {
      await pumpRegister(tester, enabled: false);
      expect(find.byKey(const Key('registerChooseMethod')), findsNothing);
      expect(find.byKey(const Key('registerWithWhatsApp')), findsNothing);
      expect(find.byKey(const Key('registerWithoutWhatsApp')), findsNothing);
      expect(find.byKey(const Key('registerManualNotice')), findsNothing);
      expect(find.byType(TextField), findsNWidgets(3));
      expect(find.text(AppStrings.arabic('submitRequest')), findsOneWidget);
    });
  });

  group('[STEP 85] معلومات إعادة المحاولة', () {
    testWidgets(
      '429 عند البدء: السبب ومتى تُقبل المحاولة، و«المتابعة بدون واتساب» زرٌّ كامل في مكانه',
      (tester) async {
        final repo = _FakeRepo()
          ..startError = const AppException(
            'طلبات كثيرة لهذا الرقم — حاول بعد قليل',
            statusCode: 429,
            code: 'WHATSAPP_VERIFY_RATE_LIMITED',
            retryAfterSeconds: 125,
          );
        SharedPreferences.setMockInitialValues({'app_language_code': 'ar'});
        final prefs = await SharedPreferences.getInstance();
        final locale = LocaleCubit(prefs)..loadPreference();
        addTearDown(locale.close);
        tester.view.physicalSize = const Size(412, 1400);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(
          BlocProvider<LocaleCubit>.value(
            value: locale,
            child: MaterialApp(
              theme: AppTheme.light,
              home: WhatsAppSignupScreen(
                initialPhone: '07701234567',
                repository: repo,
                store: MemoryWhatsAppSignupStore(),
                openLink: (_) async => false,
              ),
            ),
          ),
        );
        await tester.pump(const Duration(milliseconds: 100));
        await tester.tap(find.byKey(const Key('waSignupStart')));
        await tester.pump();
        await tester.pump();
        final limited = tester.widget<Text>(
          find.byKey(const Key('waSignupLimited')),
        );
        expect(limited.data, contains('طلبات كثيرة لهذا الرقم'));
        expect(
          limited.data,
          contains(
            AppStrings.arabic.p('waSignupRetryIn', {'time': '2:05'}),
          ),
        );
        expect(find.byKey(const Key('waSignupManualInline')), findsOneWidget);
        // لا شريط عابر مكرَّر: الرسالة في مكانها.
        expect(find.byType(SnackBar), findsNothing);
        await tester.pumpWidget(const SizedBox());
      },
    );

    test('formatWait: أرقامٌ بلا وحدات', () {
      expect(formatWait(0), '0:00');
      expect(formatWait(59), '0:59');
      expect(formatWait(125), '2:05');
      expect(formatWait(3600), '1:00:00');
      expect(formatWait(86399), '23:59:59');
    });

    test(
      'ApiClient يقرأ error.retryAfterSeconds من مغلّف 429 — وغيابه null',
      () async {
        Future<AppException> errorFrom(Map<String, Object?> error) async {
          final client = ApiClient(
            dio: Dio(BaseOptions(baseUrl: 'https://test.local/api'))
              ..httpClientAdapter = _ErrorAdapter(429, {
                'success': false,
                'data': null,
                'message': 'طلبات كثيرة',
                'error': error,
              }),
          );
          try {
            await client.post('/auth/register/whatsapp/start', body: {});
          } on AppException catch (e) {
            return e;
          }
          fail('expected AppException');
        }

        final limited = await errorFrom({
          'code': 'WHATSAPP_VERIFY_RATE_LIMITED',
          'retryAfterSeconds': 61,
        });
        expect(limited.statusCode, 429);
        expect(limited.code, 'WHATSAPP_VERIFY_RATE_LIMITED');
        expect(limited.retryAfterSeconds, 61);
        expect((await errorFrom({'code': 'RATE_LIMITED'})).retryAfterSeconds, isNull);
      },
    );
  });

  group('النصوص', () {
    test(
      'كل مفتاح waSignup* له عربي وكردي مختلفان، والمتغيّرات نفسها في اللغتين',
      () {
        final keys = AppStrings.keys
            .where((k) => k.startsWith('waSignup') || k.startsWith('regPath') || k == 'regChooseMethod' || k == 'regContinueWithoutWhatsApp' || k == 'regSwitchToWhatsApp')
            .toList();
        expect(keys.length, greaterThanOrEqualTo(20));
        for (final key in keys) {
          final ar = AppStrings.arabic(key);
          final ckb = AppStrings.kurdish(key);
          expect(ar.trim(), isNotEmpty, reason: key);
          expect(ckb, isNot(ar), reason: key);
          final vars = RegExp(r'\{\w+\}');
          expect(
            vars.allMatches(ckb).map((m) => m[0]).toSet(),
            vars.allMatches(ar).map((m) => m[0]).toSet(),
            reason: key,
          );
        }
      },
    );
  });

  test(
    'الحاوية: المستودع غير مسجَّل في الاختبارات ← شاشة التسجيل تبقى كما هي',
    () {
      // شاشة التسجيل تسأل `sl.isRegistered` قبل أي طلب؛ اختبارات التسجيل القائمة
      // (admin_managed_account_flows_test) لا تسجّله فلا يظهر زرّ واتساب.
      expect(sl.isRegistered<WhatsAppSignupRepository>(), isFalse);
    },
  );
}
