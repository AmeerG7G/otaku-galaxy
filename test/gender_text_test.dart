// النصّ العربي المصرَّف حسب الجنس.
//
// [CRITICAL] العربية تُصرِّف الخطاب: «أضف» و«أضيفي»، «بطل المجرة» و«بطلة
// المجرة». تطبيقٌ يخاطب الجميع بالمذكّر يخطئ في حقّ نصف زبائنه في كل جملة.
//
// ما يُقاس هنا هو الآلية المركزية (`core/l10n/gender.dart`) لا كل نصّ في
// التطبيق: ما دام الاختيار يقع في مكان واحد، فتغطيةٌ تمثيلية تكفي.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/gender.dart';
import 'package:otaku_galaxy/features/auth/data/datasources/auth_local_storage.dart';
import 'package:otaku_galaxy/features/auth/domain/entities/auth_session.dart';
import 'package:otaku_galaxy/features/auth/domain/entities/user.dart';
import 'package:otaku_galaxy/features/auth/domain/repositories/auth_repository.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/change_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/forgot_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/get_me_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/login_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/register_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/reset_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/send_otp_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/update_profile_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/verify_otp_usecase.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/auth/presentation/screens/register_screen.dart';
import 'package:otaku_galaxy/features/points/domain/entities/otaku_level.dart';

User _userWith(String? gender) => User(
  id: 'u1',
  username: 'مدقق',
  phone: '07701234567',
  role: 'customer',
  gender: gender,
);

class _StubAuthRepository implements AuthRepository {
  _StubAuthRepository(this.user);

  User user;

  @override
  Future<User> me() async => user;
  @override
  Future<AuthSession> login(String phone, String password) async =>
      AuthSession(token: 't', user: user);
  @override
  Future<void> register({
    required String username,
    required String phone,
    required String password,
    required String gender,
  }) async {}
  @override
  Future<AuthSession> verifyOtp(String phone, String code) async =>
      AuthSession(token: 't', user: user);
  @override
  Future<void> sendOtp(String phone) async {}
  @override
  Future<void> forgotPassword(String phone) async {}
  @override
  Future<void> resetPassword(String p, String c, String n) async {}
  @override
  Future<User> updateProfile({
    String? username,
    String? avatarUrl,
    bool clearAvatar = false,
    String? gender,
  }) async {
    user = user.copyWith(gender: gender);
    return user;
  }

  @override
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {}
}

class _InMemoryAuthStorage implements AuthLocalStorage {
  _InMemoryAuthStorage(this.user);

  final User user;

  @override
  bool get isLoggedIn => true;
  @override
  String? get token => 't';
  @override
  String? getUserJson() => jsonEncode(user.toJson());
  @override
  Future<void> load() async {}
  @override
  Future<void> saveSession(String token, String userJson) async {}
  @override
  Future<void> updateUser(String userJson) async {}
  @override
  Future<void> logout() async {}
}

AuthCubit _cubitFor(String? gender) {
  final user = _userWith(gender);
  final repo = _StubAuthRepository(user);
  return AuthCubit(
    localStorage: _InMemoryAuthStorage(user),
    loginUsecase: LoginUsecase(repo),
    registerUsecase: RegisterUsecase(repo),
    sendOtpUsecase: SendOtpUsecase(repo),
    forgotPasswordUsecase: ForgotPasswordUsecase(repo),
    verifyOtpUsecase: VerifyOtpUsecase(repo),
    resetPasswordUsecase: ResetPasswordUsecase(repo),
    getMeUsecase: GetMeUsecase(repo),
    updateProfileUsecase: UpdateProfileUsecase(repo),
    changePasswordUsecase: ChangePasswordUsecase(repo),
  );
}

/// يبني شجرةً فيها جلسة بالجنس المطلوب ويعرض نصّاً مصرَّفاً عبر `context.g`.
Future<void> _pumpWithGender(
  WidgetTester tester,
  String? gender,
  Gendered text,
) async {
  final cubit = _cubitFor(gender);
  await cubit.loadSession();
  await tester.pumpWidget(
    BlocProvider<AuthCubit>.value(
      value: cubit,
      child: MaterialApp(
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: Builder(builder: (context) => Text(context.g(text))),
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  group('AppGender', () {
    test('يترجم قيمة الخادم', () {
      expect(AppGender.fromValue('male'), AppGender.male);
      expect(AppGender.fromValue('female'), AppGender.female);
    });

    test('[CRITICAL] الغياب والقيم المجهولة تصير «مجهولاً» لا مذكّراً', () {
      // لا يُخمَّن جنس أحد: `null` أو قيمة لا نعرفها تعني «لم يُسأل».
      expect(AppGender.fromValue(null), AppGender.unknown);
      expect(AppGender.fromValue(''), AppGender.unknown);
      expect(AppGender.fromValue('other'), AppGender.unknown);
      expect(AppGender.fromValue('MALE'), AppGender.unknown);
      expect(AppGender.unknown.isKnown, isFalse);
    });

    test('القيمة المرسَلة للخادم مطابقة لتعداده', () {
      expect(AppGender.male.value, 'male');
      expect(AppGender.female.value, 'female');
      expect(AppGender.unknown.value, isNull);
    });
  });

  group('Gendered', () {
    test('يختار الصيغة الموافقة', () {
      const text = Gendered('أضف', 'أضيفي', neutral: 'إضافة');
      expect(text.of(AppGender.male), 'أضف');
      expect(text.of(AppGender.female), 'أضيفي');
      expect(text.of(AppGender.unknown), 'إضافة');
    });

    test('بلا صيغة محايدة يسقط إلى المذكّرة', () {
      // إقرارٌ بأن لا صياغة محايدة طبيعية لهذه الجملة — لا خيار افتراضي غافل.
      const text = Gendered('أهلاً بك', 'أهلاً بكِ');
      expect(text.of(AppGender.unknown), 'أهلاً بك');
    });

    test('صيغ الأمر الشائعة صحيحة نحوياً', () {
      expect(GenderedStrings.addToCart.of(AppGender.male), 'أضف إلى السلة');
      expect(GenderedStrings.addToCart.of(AppGender.female), 'أضيفي إلى السلة');
      expect(
        GenderedStrings.chooseGovernorate.of(AppGender.female),
        'اختاري المحافظة',
      );
      expect(GenderedStrings.rateProduct.of(AppGender.female), 'قيّمي المنتج');
      expect(GenderedStrings.completeOrder.of(AppGender.female), 'أكملي الطلب');
      expect(GenderedStrings.registerCta.of(AppGender.female), 'سجّلي الآن');
    });

    test('[CRITICAL] الصيغة المحايدة مصدرٌ لا أمرٌ مذكّر', () {
      // «إضافة إلى السلة» تصلح للجميع؛ «أضف» تفترض مخاطَباً بعينه.
      for (final text in [
        GenderedStrings.addToCart,
        GenderedStrings.completeOrder,
        GenderedStrings.chooseGovernorate,
        GenderedStrings.rateProduct,
        GenderedStrings.addPhotos,
      ]) {
        expect(text.neutral, isNotNull);
        expect(text.of(AppGender.unknown), isNot(text.male));
      }
    });
  });

  group('أسماء مستويات المجرّة', () {
    OtakuLevel level(
      String key,
      String male,
      String female,
      String neutral,
    ) => OtakuLevel(
      key: key,
      number: 1,
      nameMale: male,
      nameFemale: female,
      nameNeutral: neutral,
      reward: '',
      rewardKind: 'none',
      threshold: 0,
    );

    test('الصيغة المذكّرة لصاحب الحساب الذكر', () {
      expect(
        level('champion', 'بطل المجرة', 'بطلة المجرة', 'مستوى البطولة')
            .nameFor(AppGender.male),
        'بطل المجرة',
      );
      expect(
        level('star', 'نجم المجرة', 'نجمة المجرة', 'مستوى النجومية')
            .nameFor(AppGender.male),
        'نجم المجرة',
      );
    });

    test('الصيغة المؤنّثة لصاحبة الحساب', () {
      expect(
        level('beginner', 'مبتدئ المجرة', 'مبتدئة المجرة', 'المستوى المبتدئ')
            .nameFor(AppGender.female),
        'مبتدئة المجرة',
      );
      expect(
        level('explorer', 'مستكشف المجرة', 'مستكشفة المجرة', 'مستوى الاستكشاف')
            .nameFor(AppGender.female),
        'مستكشفة المجرة',
      );
      expect(
        level('warrior', 'محارب المجرة', 'محاربة المجرة', 'مستوى القتال')
            .nameFor(AppGender.female),
        'محاربة المجرة',
      );
    });

    test('[CRITICAL] «رحّالة» و«أسطورة» لا تتغيّران بالجنس', () {
      // اشتقاقٌ آلي بإضافة تاء كان سينتج «أسطورةة».
      final voyager = level(
        'voyager',
        'رحّالة المجرة',
        'رحّالة المجرة',
        'مستوى الترحال',
      );
      expect(voyager.nameFor(AppGender.male), voyager.nameFor(AppGender.female));

      final legend = level(
        'legend',
        'أسطورة المجرة',
        'أسطورة المجرة',
        'مستوى الأسطورة',
      );
      expect(legend.nameFor(AppGender.male), legend.nameFor(AppGender.female));
    });

    test('[CRITICAL] المجهول يقرأ صيغة محايدة لا مذكّرة', () {
      final champion = level(
        'champion',
        'بطل المجرة',
        'بطلة المجرة',
        'مستوى البطولة',
      );
      expect(champion.nameFor(AppGender.unknown), 'مستوى البطولة');
      expect(champion.nameFor(AppGender.unknown), isNot('بطل المجرة'));
    });

    test('المنطق يمرّ على المفتاح لا على الاسم المعروض', () {
      final a = level('champion', 'بطل المجرة', 'بطلة المجرة', 'مستوى البطولة');
      final b = level('champion', 'اسم آخر', 'اسم آخر', 'اسم آخر');
      expect(a, equals(b));
    });
  });

  group('context.g داخل شجرة حقيقية', () {
    testWidgets('يقرأ جنس صاحب الجلسة ويعرض صيغته', (tester) async {
      await _pumpWithGender(tester, 'female', GenderedStrings.addToCart);
      expect(find.text('أضيفي إلى السلة'), findsOneWidget);

      await _pumpWithGender(tester, 'male', GenderedStrings.addToCart);
      expect(find.text('أضف إلى السلة'), findsOneWidget);
    });

    testWidgets('الحساب القديم بلا جنس يقرأ الصيغة المحايدة', (tester) async {
      await _pumpWithGender(tester, null, GenderedStrings.addToCart);
      expect(find.text('إضافة إلى السلة'), findsOneWidget);
    });
  });

  group('التسجيل يشترط الاختيار', () {
    testWidgets('[CRITICAL] الإرسال بلا اختيار يُوقَف ولا يصل الخادم', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(430, 1400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      final repo = _StubAuthRepository(_userWith(null));
      final calls = <String>[];
      final cubit = AuthCubit(
        localStorage: _InMemoryAuthStorage(_userWith(null)),
        loginUsecase: LoginUsecase(repo),
        registerUsecase: _RecordingRegister(repo, calls),
        sendOtpUsecase: SendOtpUsecase(repo),
        forgotPasswordUsecase: ForgotPasswordUsecase(repo),
        verifyOtpUsecase: VerifyOtpUsecase(repo),
        resetPasswordUsecase: ResetPasswordUsecase(repo),
        getMeUsecase: GetMeUsecase(repo),
        updateProfileUsecase: UpdateProfileUsecase(repo),
        changePasswordUsecase: ChangePasswordUsecase(repo),
      );

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

      // بيانات صحيحة كاملة — عدا الجنس.
      final fields = find.byType(TextField);
      await tester.enterText(fields.at(0), 'مستخدم جديد');
      await tester.enterText(fields.at(1), '07701234567');
      await tester.enterText(fields.at(2), 'secret123');
      await tester.pump();

      await tester.tap(find.text('إرسال رمز التحقق'));
      await tester.pump();

      // لم يُرسَل شيء، وظهرت رسالة التحقق.
      expect(calls, isEmpty);
      expect(find.text('يرجى اختيار الجنس'), findsOneWidget);
    });

    testWidgets('لا اختيار مُسبَق — نصفُ الحسابات لا يُنشأ بالغفلة', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(430, 1400);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      final repo = _StubAuthRepository(_userWith(null));
      final cubit = AuthCubit(
        localStorage: _InMemoryAuthStorage(_userWith(null)),
        loginUsecase: LoginUsecase(repo),
        registerUsecase: RegisterUsecase(repo),
        sendOtpUsecase: SendOtpUsecase(repo),
        forgotPasswordUsecase: ForgotPasswordUsecase(repo),
        verifyOtpUsecase: VerifyOtpUsecase(repo),
        resetPasswordUsecase: ResetPasswordUsecase(repo),
        getMeUsecase: GetMeUsecase(repo),
        updateProfileUsecase: UpdateProfileUsecase(repo),
        changePasswordUsecase: ChangePasswordUsecase(repo),
      );

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

      // البطاقتان معروضتان ولا واحدة منهما محدَّدة سلفاً.
      final selector = tester.widget<GenderSelector>(
        find.byType(GenderSelector),
      );
      expect(selector.value, isNull);
    });
  });

  group('اختيار الجنس المرئي', () {
    testWidgets('بطاقتان بأيقونتين — لا حقل نصّي', (tester) async {
      AppGender? picked;
      await tester.pumpWidget(
        MaterialApp(
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: Scaffold(
              body: GenderSelector(
                value: null,
                onChanged: (value) => picked = value,
              ),
            ),
          ),
        ),
      );

      expect(find.text('ذكر'), findsOneWidget);
      expect(find.text('أنثى'), findsOneWidget);
      expect(find.byIcon(Icons.male_rounded), findsOneWidget);
      expect(find.byIcon(Icons.female_rounded), findsOneWidget);
      // [CRITICAL] لا حقل كتابة: الاختيار بالضغط لا بالإملاء.
      expect(find.byType(TextField), findsNothing);

      await tester.tap(find.text('أنثى'));
      expect(picked, AppGender.female);

      await tester.tap(find.text('ذكر'));
      expect(picked, AppGender.male);
    });

    testWidgets('يعرض رسالة التحقق عند الإرسال بلا اختيار', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: Scaffold(
              body: GenderSelector(
                value: null,
                onChanged: (_) {},
                errorText: GenderedStrings.genderRequired,
              ),
            ),
          ),
        ),
      );
      expect(find.text('يرجى اختيار الجنس'), findsOneWidget);
    });

    testWidgets('لا خيار ثالث للمجهول', (tester) async {
      // «مجهول» حالةُ من لم يُسأل، لا خيارٌ يُعرض على من فُتحت له الشاشة.
      await tester.pumpWidget(
        MaterialApp(
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: Scaffold(
              body: GenderSelector(value: null, onChanged: (_) {}),
            ),
          ),
        ),
      );
      expect(find.byType(Semantics), findsWidgets);
      expect(find.text('لم يُحدَّد'), findsNothing);
    });
  });
}

/// يسجّل نداءات التسجيل بدل تنفيذها — ليثبت الاختبار أن شيئاً لم يُرسَل.
class _RecordingRegister implements RegisterUsecase {
  _RecordingRegister(this._repo, this.calls);

  final AuthRepository _repo;
  final List<String> calls;

  @override
  Future<void> call({
    required String username,
    required String phone,
    required String password,
    required String gender,
  }) async {
    calls.add(gender);
    await _repo.register(
      username: username,
      phone: phone,
      password: password,
      gender: gender,
    );
  }
}
