// تدقيق تسرّب العربية في الواجهة الكردية — المصفوفة كاملةً.
//
// [CRITICAL] العطب الذي يحرسه هذا الملف: كانت الترجمات الكردية **موجودة**
// ولا تصل الشاشة. `context.g` كان يستدعي `Gendered.of(gender)` — يعرف الجنس
// ولا يعرف اللغة — فيُرجع العربية دائماً؛ و`ofLocale` الصحيحة لم يستدعِها
// إلا الاختبار. فمرّ الاختبار وتسرّبت العربية: «اختر كل الخيارات المطلوبة…»
// في صفحة منتجٍ كردية.
//
// لذلك يُقاس هنا ما تراه الشاشة عبر المسار الذي تسلكه الودجات فعلاً
// (`context.g` داخل شجرةٍ فيها `LocaleCubit` و`AuthCubit`)، لا الدالّة
// الصحيحة مباشرةً. والمصفوفة: {عربي، كردي} × {ذكر، أنثى، مجهول}.
//
// أهداف الأفخاخ (tripwires) المتّفق عليها:
//   ١. إرجاع `context.g` إلى `of(gender)` ← تسقط مجموعة «الخيارات» و«كل
//      المفاهيم».
//   ٢. إسقاط `key` من ردّ الأقسام / إعادة الترتيب إلى `name` ← تسقط
//      مجموعة «هوية القسم».
//   ٣. تفريغ `nameCkb` لمستوىً واحد في `galaxyPoints.ts` ← تسقط مجموعة
//      «المستويات».

import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' hide Category;
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/components/cards/anime_category_card.dart';
import 'package:otaku_galaxy/core/design_system/components/inputs/gender_selector.dart';
import 'package:otaku_galaxy/core/design_system/themes/app_theme.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/l10n/gender.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';
import 'package:otaku_galaxy/features/auth/domain/entities/user.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/change_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/forgot_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/get_me_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/login_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/register_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/update_profile_usecase.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/points/domain/entities/otaku_level.dart';
import 'package:otaku_galaxy/features/products/domain/entities/category.dart';
import 'package:otaku_galaxy/features/products/domain/entities/category_order.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/auth_stub.dart';

/// أي حرفٍ من كتلة العربية الأساسية **لا يُستعمل في السوراني**.
///
/// الكردية تشارك العربية معظم الحروف، فلا يكفي فحص «نطاق العربية». الحروف
/// أدناه عربيةٌ خالصة: التاء المربوطة، الكاف والياء العربيتان (الكردية تكتب
/// ک و ی)، التنوين والتشكيل، والحروف التي لا وجود لها في الكردية.
final RegExp _arabicOnly = RegExp(
  '[ةكيثذصضطظ'
  '\u064B-\u0652' // تنوين وتشكيل
  ']',
);

bool _hasArabicOnly(String s) => _arabicOnly.hasMatch(s);

/// شجرة حقيقية: `LocaleCubit` بلغةٍ معيّنة و`AuthCubit` بجنسٍ معيّن.
Future<void> _pump(
  WidgetTester tester, {
  required AppLanguage language,
  String? gender,
  required WidgetBuilder builder,
}) async {
  SharedPreferences.setMockInitialValues({'app_language_code': language.code});
  final prefs = await SharedPreferences.getInstance();
  final locale = LocaleCubit(prefs)..loadPreference();
  final auth = stubAuthCubit(gender: gender);
  await auth.loadSession();
  addTearDown(locale.close);
  addTearDown(auth.close);

  await tester.pumpWidget(
    MultiBlocProvider(
      providers: [
        BlocProvider<LocaleCubit>.value(value: locale),
        BlocProvider<AuthCubit>.value(value: auth),
      ],
      child: MaterialApp(
        theme: AppTheme.light,
        locale: language.locale,
        localizationsDelegates: const [
          DefaultMaterialLocalizations.delegate,
          DefaultWidgetsLocalizations.delegate,
        ],
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(body: Builder(builder: builder)),
        ),
      ),
    ),
  );
  await tester.pump();
}

/// يعرض `context.g(text)` ويُرجع ما ظهر فعلاً.
Future<String> _shown(
  WidgetTester tester,
  Gendered text, {
  required AppLanguage language,
  String? gender,
}) async {
  await _pump(
    tester,
    language: language,
    gender: gender,
    builder: (context) => Text(context.g(text), key: const Key('shown')),
  );
  return tester.widget<Text>(find.byKey(const Key('shown'))).data!;
}

/// يلتقط ترويسات الطلب بدل إرساله.
class _CapturingAdapter implements HttpClientAdapter {
  Map<String, dynamic>? lastHeaders;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    lastHeaders = options.headers;
    return ResponseBody.fromString(
      '{"success":true,"data":null,"message":null}',
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

/// مستودعٌ يسجّل ما أُرسل إلى `updateProfile`.
class _RecordingRepo extends StubAuthRepository {
  _RecordingRepo(super.user);
  final List<String?> sentLanguages = [];

  @override
  Future<User> updateProfile({
    String? username,
    String? avatarUrl,
    bool clearAvatar = false,
    String? gender,
    String? preferredLanguage,
  }) async {
    sentLanguages.add(preferredLanguage);
    user = user.copyWith(preferredLanguage: preferredLanguage);
    return user;
  }
}

AuthCubit _cubitWith(_RecordingRepo repo, AppLanguage language) => AuthCubit(
  localStorage: InMemoryAuthStorage(repo.user),
  loginUsecase: LoginUsecase(repo),
  registerUsecase: RegisterUsecase(repo),
  forgotPasswordUsecase: ForgotPasswordUsecase(repo),
  getMeUsecase: GetMeUsecase(repo),
  updateProfileUsecase: UpdateProfileUsecase(repo),
  changePasswordUsecase: ChangePasswordUsecase(repo),
  languageOf: () => language,
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('[CRITICAL] رسالة خيارات المنتج — المسار الذي تسلكه الشاشة', () {
    const text = GenderedStrings.chooseAllOptions;

    testWidgets('عربي + ذكر: الصيغة المذكّرة', (tester) async {
      expect(
        await _shown(tester, text, language: AppLanguage.arabic, gender: 'male'),
        text.male,
      );
    });

    testWidgets('عربي + أنثى: الصيغة المؤنّثة — لا انحدار', (tester) async {
      expect(
        await _shown(tester, text, language: AppLanguage.arabic, gender: 'female'),
        text.female,
      );
    });

    testWidgets('[CRITICAL] كردي + ذكر: الكردية لا العربية', (tester) async {
      final s = await _shown(tester, text, language: AppLanguage.kurdish, gender: 'male');
      expect(s, text.ckb, reason: 'ظهرت العربية في صفحة منتجٍ كردية');
      expect(_hasArabicOnly(s), isFalse, reason: 'حرفٌ عربيّ خالص في نصٍّ كردي: $s');
    });

    testWidgets('[CRITICAL] كردي + أنثى: الصيغة الكردية **نفسها** — لا تفريع', (tester) async {
      final female = await _shown(tester, text, language: AppLanguage.kurdish, gender: 'female');
      final male = await _shown(tester, text, language: AppLanguage.kurdish, gender: 'male');
      expect(female, male);
      expect(female, text.ckb);
    });

    testWidgets('كردي + مجهول: الكردية أيضاً — لا صيغة محايدة عربية', (tester) async {
      expect(
        await _shown(tester, text, language: AppLanguage.kurdish, gender: null),
        text.ckb,
      );
    });
  });

  group('[CRITICAL] كل مفهوم مصرَّف يصل الشاشة كردياً في الواجهة الكردية', () {
    testWidgets('الثلاثة والثلاثون عبر context.g — لا حرف عربي خالص', (tester) async {
      final leaked = <String>[];
      for (final entry in GenderedStrings.all.entries) {
        final s = await _shown(tester, entry.value, language: AppLanguage.kurdish, gender: 'male');
        if (s != entry.value.ckb || _hasArabicOnly(s)) leaked.add('${entry.key}: $s');
      }
      expect(leaked, isEmpty, reason: 'تسرّب عربي عبر context.g:\n${leaked.join('\n')}');
    });

    testWidgets('gNow (خارج build) يسلك المسار نفسه', (tester) async {
      String? s;
      await _pump(
        tester,
        language: AppLanguage.kurdish,
        gender: 'female',
        builder: (context) => TextButton(
          onPressed: () => s = context.gNow(GenderedStrings.loginFirst),
          child: const Text('x'),
        ),
      );
      await tester.tap(find.byType(TextButton));
      expect(s, GenderedStrings.loginFirst.ckb);
    });

    testWidgets('العربية تحتفظ بتصريفها: ذكر ≠ أنثى حيث تختلف الصيغتان', (tester) async {
      final m = await _shown(tester, GenderedStrings.addToCart, language: AppLanguage.arabic, gender: 'male');
      final f = await _shown(tester, GenderedStrings.addToCart, language: AppLanguage.arabic, gender: 'female');
      expect(m, 'أضف إلى السلة');
      expect(f, 'أضيفي إلى السلة');
    });
  });

  group('[CRITICAL] الجنس — أسماء الخيارين', () {
    testWidgets('عربي: «ذكر» و«أنثى» — مختلفتان', (tester) async {
      await _pump(
        tester,
        language: AppLanguage.arabic,
        builder: (_) => GenderSelector(value: null, onChanged: (_) {}),
      );
      expect(find.text('ذكر'), findsOneWidget);
      expect(find.text('أنثى'), findsOneWidget);
      expect(find.text('الجنس'), findsOneWidget);
    });

    testWidgets('[CRITICAL] كردي: «نێر» و«مێ» — مختلفتان ولا عربية', (tester) async {
      await _pump(
        tester,
        language: AppLanguage.kurdish,
        builder: (_) => GenderSelector(value: null, onChanged: (_) {}),
      );
      expect(find.text('نێر'), findsOneWidget);
      expect(find.text('مێ'), findsOneWidget);
      expect(find.text('ڕەگەز'), findsOneWidget);
      expect(find.text('ذكر'), findsNothing);
      expect(find.text('أنثى'), findsNothing);
      expect(find.text('الجنس'), findsNothing);
    });

    testWidgets('رسالة «اختر الجنس» كردية في الواجهة الكردية', (tester) async {
      await _pump(
        tester,
        language: AppLanguage.kurdish,
        builder: (context) => GenderSelector(
          value: null,
          onChanged: (_) {},
          errorText: context.strings('genderRequired'),
        ),
      );
      expect(find.text(AppStrings.kurdish('genderRequired')), findsOneWidget);
      expect(find.text('يرجى اختيار الجنس'), findsNothing);
    });

    test('لا ثابت جنسٍ عربي بقي في GenderedStrings', () {
      final src = File('lib/core/l10n/gender.dart').readAsStringSync();
      expect(src, isNot(contains("static const male = ")));
      expect(src, isNot(contains("static const female = ")));
      expect(src, isNot(contains("static const genderLabel = ")));
    });
  });

  group('[CRITICAL] أسماء المستويات — الخادم مصدر الحقيقة', () {
    /// المستويات السبعة كما يعرّفها الخادم — تُقرأ من الملف نفسه.
    List<Map<String, String>> serverLevels() {
      final src = File('../backend/src/domain/galaxyPoints.ts').existsSync()
          ? File('../backend/src/domain/galaxyPoints.ts').readAsStringSync()
          : File('backend/src/domain/galaxyPoints.ts').readAsStringSync();
      final start = src.indexOf('export const GALAXY_LEVELS');
      final body = src.substring(start, src.indexOf('] as const;', start));
      final levels = <Map<String, String>>[];
      // التقسيم على `key:` لا على `{` — `reward: { kind… }` قوسٌ داخلي كان
      // يقطع الكتلة قبل `rewardLabelCkb` فيقرؤها فارغةً دائماً.
      for (final block in body.split(RegExp(r"\bkey: '")).skip(1)) {
        String field(String name) =>
            RegExp("$name: '([^']*)'").firstMatch(block)?.group(1) ?? '';
        levels.add({
          'key': RegExp(r"^([a-z]+)'").firstMatch(block)?.group(1) ?? '',
          'nameMale': field('nameMale'),
          'nameCkb': field('nameCkb'),
          'rewardLabelCkb': field('rewardLabelCkb'),
        });
      }
      return levels;
    }

    test('[TRIPWIRE] المستويات السبعة كلها تحمل nameCkb غير فارغ وبلا عربية', () {
      final levels = serverLevels();
      expect(levels.length, 7);
      final missing = [
        for (final l in levels)
          if (l['nameCkb']!.trim().isEmpty || _hasArabicOnly(l['nameCkb']!))
            '${l['key']}: "${l['nameCkb']}"',
      ];
      expect(missing, isEmpty, reason: 'مستوى بلا اسم كردي — سيسقط إلى العربية:\n$missing');
    });

    test('وصف المزيّة كردي لكل مستوى', () {
      final missing = [
        for (final l in serverLevels())
          if (l['rewardLabelCkb']!.trim().isEmpty || _hasArabicOnly(l['rewardLabelCkb']!)) l['key'],
      ];
      expect(missing, isEmpty);
    });

    test('OtakuLevel يختار بالجنس في العربية وباللغة في الكردية', () {
      final level = OtakuLevel.fromJson({
        'key': 'champion',
        'number': 5,
        'requiredPoints': 600,
        'nameMale': 'بطل المجرة',
        'nameFemale': 'بطلة المجرة',
        'nameNeutral': 'مستوى البطولة',
        'nameCkb': 'پاڵەوانی گەلاکسی',
        'reward': 'هدية',
        'rewardCkb': 'دیاری',
        'rewardKind': 'gift',
      });
      expect(level.nameFor(AppGender.male), 'بطل المجرة');
      expect(level.nameFor(AppGender.female), 'بطلة المجرة');
      expect(level.nameFor(AppGender.male, AppLanguage.kurdish), 'پاڵەوانی گەلاکسی');
      expect(level.nameFor(AppGender.female, AppLanguage.kurdish), 'پاڵەوانی گەلاکسی');
      expect(level.rewardFor(AppLanguage.kurdish), 'دیاری');
      expect(level.rewardFor(AppLanguage.arabic), 'هدية');
    });

    test('ردٌّ قديم بلا nameCkb يسقط إلى العربية — نصٌّ لا فراغ', () {
      final level = OtakuLevel.fromJson({
        'key': 'star',
        'nameMale': 'نجم المجرة',
        'nameFemale': 'نجمة المجرة',
        'nameNeutral': 'مستوى النجومية',
      });
      expect(level.nameFor(AppGender.male, AppLanguage.kurdish), 'نجم المجرة');
    });
  });

  group('[CRITICAL] هوية القسم مستقلّة عن لغة اسمه', () {
    const kurdishName = 'قرتاسیە';

    test('[TRIPWIRE] قسمٌ باسم كردي ومفتاح عربي يحتفظ برتبته ولونه', () {
      const localized = Category(id: 'x', name: kurdishName, key: 'قرطاسية');
      const arabic = Category(id: 'x', name: 'قرطاسية');
      expect(mainCategoryRank(localized), 0);
      expect(mainCategoryRank(localized), mainCategoryRank(arabic));
      expect(
        AnimeCategoryCard.gradientForCategory(localized),
        AnimeCategoryCard.gradientForCategory(arabic),
      );
    });

    test('بلا مفتاح — الاسم الكردي وحده يُسقط القسم من الترتيب (سبب وجود key)', () {
      const noKey = Category(id: 'x', name: kurdishName);
      expect(mainCategoryRank(noKey), kMainCategoryOrder.length);
    });

    test('Category.fromJson يقرأ key ويسقط إلى name عند غيابه', () {
      final withKey = Category.fromJson({'id': '1', 'name': kurdishName, 'key': 'قرطاسية'});
      final without = Category.fromJson({'id': '1', 'name': 'قرطاسية'});
      expect(withKey.stableKey, 'قرطاسية');
      expect(without.stableKey, 'قرطاسية');
    });

    test('[TRIPWIRE] المكوّنان يقفلان على stableKey لا name', () {
      final order = File('lib/features/products/domain/entities/category_order.dart').readAsStringSync();
      final card = File('lib/core/design_system/components/cards/anime_category_card.dart').readAsStringSync();
      expect(order, contains('canonicalCategoryKey(category.stableKey)'));
      expect(order, isNot(contains('canonicalCategoryKey(category.name)')));
      expect(card, contains('canonicalCategoryKey(category.stableKey)'));
      expect(card, isNot(contains('canonicalCategoryKey(category.name)')));
    });
  });

  group('[CRITICAL] اللغة تصل الخادم', () {
    test('Accept-Language مع كل طلب من languageProvider', () async {
      final adapter = _CapturingAdapter();
      final dio = Dio(BaseOptions(baseUrl: 'http://x'))..httpClientAdapter = adapter;
      final client = ApiClient(dio: dio, languageProvider: () => 'ckb');
      await client.get('/ping');
      expect(adapter.lastHeaders?['Accept-Language'], 'ckb');
    });

    test('بلا مزوّد — لا ترويسة (لا قيمة مخترَعة)', () async {
      final adapter = _CapturingAdapter();
      final dio = Dio(BaseOptions(baseUrl: 'http://x'))..httpClientAdapter = adapter;
      await ApiClient(dio: dio).get('/ping');
      expect(adapter.lastHeaders?.containsKey('Accept-Language'), isFalse);
    });

    test('[CRITICAL] الجلسة تدفع preferredLanguage حين تخالف لغة الواجهة', () async {
      final repo = _RecordingRepo(stubUser(gender: 'male').copyWith(preferredLanguage: 'ar'));
      final cubit = _cubitWith(repo, AppLanguage.kurdish);
      await cubit.loadSession();
      expect(repo.sentLanguages, ['ckb']);
      await cubit.close();
    });

    test('ولا تدفع شيئاً حين تتطابق — لا طلب زائد', () async {
      final repo = _RecordingRepo(stubUser(gender: 'male').copyWith(preferredLanguage: 'ckb'));
      final cubit = _cubitWith(repo, AppLanguage.kurdish);
      await cubit.loadSession();
      expect(repo.sentLanguages, isEmpty);
      await cubit.close();
    });

    test('تبديل اللغة يستدعي المزامنة', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final locale = LocaleCubit(prefs);
      AppLanguage? synced;
      locale.onLanguageChanged = (l) async => synced = l;
      await locale.setLanguage(AppLanguage.kurdish);
      expect(synced, AppLanguage.kurdish);
      await locale.close();
    });

    test('المستودع يرسل preferredLanguage في جسم PATCH /auth/me', () {
      final src = File('lib/features/auth/data/repositories/auth_repository_impl.dart').readAsStringSync();
      expect(src, contains("body['preferredLanguage'] = preferredLanguage"));
    });
  });

  group('AppStrings — الجنس والخيارات كاملة الترجمة', () {
    test('المفاتيح الخمسة الجديدة في اللغتين، ولا مفتاح ناقص', () {
      for (final k in ['gender', 'genderMale', 'genderFemale', 'genderRequired', 'genderNotSet']) {
        expect(AppStrings.arabic(k), isNot(k), reason: '$k بلا عربية');
        expect(AppStrings.kurdish(k), isNot(AppStrings.arabic(k)), reason: '$k بلا كردية');
      }
      expect(AppStrings.pendingKeys, isEmpty);
    });
  });
}
