// التسجيل عبر واتساب (WHATSAPP_VERIFY_MODE=auto) — آلة الحالات والشاشة.
//
// المزوّد والخادم مزيَّفان: لا شبكة ولا منصّة. ما يُثبَت:
//   - الحالة تأتي من الخادم، والاستعلام يتوقّف عند حالةٍ نهائية ويُستأنف عند العودة.
//   - كلمة المرور لا تُطلب قبل «تحقّق»؛ الإكمال يسلّم الجلسة لمكعّب المصادقة.
//   - الجلسة تُحفظ وتُستأنف بعد إغلاق النظام للتطبيق، وتُمسح عند النهاية.
//   - الوضع off (أو خادمٌ أقدم): شاشة التسجيل كما هي حرفياً — لا زرّ واتساب.
//   - البديل الإداري ظاهرٌ في كل خطوة.

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/themes/app_theme.dart';
import 'package:otaku_galaxy/core/di/injection_container.dart';
import 'package:otaku_galaxy/core/errors/app_exception.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
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
  int statusCalls = 0;
  final List<String> started = [];
  final List<Map<String, String>> completed = [];

  @override
  Future<WhatsAppSignupOptions> options() async => optionsValue;

  @override
  Future<WhatsAppSignupSession> start(String phone) async {
    started.add(phone);
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

  group('النصوص', () {
    test(
      'كل مفتاح waSignup* له عربي وكردي مختلفان، والمتغيّرات نفسها في اللغتين',
      () {
        final keys = AppStrings.keys
            .where((k) => k.startsWith('waSignup'))
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
