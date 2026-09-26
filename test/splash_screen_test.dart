// شاشة البداية OTSUKU — إعادة بناء على مرجع التصميم `Otaku Galaxy v2.dc.html`.
//
// الضمانات:
//   - مكوّنات العرض الثلاثة (الخلفية / الهوية / التحميل) تُبنى بلا تجاوز
//     تخطيط على مقاسات مختلفة وفي الوضعين الفاتح والداكن وبالـRTL.
//   - ألوان الشاشة ثابتة (مرجعية) لا تعتمد على السمة الداكنة — فالمرجع
//     يحتفظ بتدرّجه الفاتح ونصوصه الداكنة حرفياً في الوضعين.
//   - الشاشة الكاملة تُبنى، وتعرِض الشعار والاسم والشعار النصّي وشريط
//     التحميل، ثم تنتقل إلى شاشة التعريف بعد مدة `armSplash` (٢٫٣ ث).

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/tokens/app_colors.dart';
import 'package:otaku_galaxy/core/di/injection_container.dart';
import 'package:otaku_galaxy/core/router/app_router.dart';
import 'package:otaku_galaxy/features/auth/data/datasources/auth_local_storage.dart';
import 'package:otaku_galaxy/features/auth/domain/entities/auth_session.dart';
import 'package:otaku_galaxy/features/auth/domain/entities/account_request.dart';
import 'package:otaku_galaxy/features/auth/domain/entities/user.dart';
import 'package:otaku_galaxy/features/auth/domain/repositories/auth_repository.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/change_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/forgot_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/get_me_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/login_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/register_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/update_profile_usecase.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/onboarding/data/onboarding_storage.dart';
import 'package:otaku_galaxy/features/settings/data/store_settings_repository.dart';
import 'package:otaku_galaxy/features/splash/presentation/widgets/splash_animations.dart';
import 'package:otaku_galaxy/features/splash/presentation/widgets/splash_backdrop.dart';
import 'package:otaku_galaxy/features/splash/presentation/widgets/splash_brand.dart';
import 'package:otaku_galaxy/features/splash/presentation/widgets/splash_loader.dart';
import 'package:otaku_galaxy/features/visuals/data/visuals_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _user = User(
  id: 'u1',
  username: 'مدقق',
  phone: '07701234567',
  role: 'customer',
);

const _brandTitle = 'مجرة الأوتاكو';
const _brandTagline = 'عالم الأنمي بين يديك';
const _loadCaption = 'جاري التحميل…';
const _retryLabel = 'إعادة المحاولة';

// ─────────────────────────────────────────────────────────────────────────
// مكوّنات العرض — تُبنى مستقلة بلا حاجة إلى شبكة/DI.
// ─────────────────────────────────────────────────────────────────────────

// محرك محتوى كل مكوّن بعروض/التتابع عند قيم ثابتة (مستقرة) للتحقق من
// البناء والتخطيط.
class _SettledBrand extends StatelessWidget {
  const _SettledBrand();

  @override
  Widget build(BuildContext context) {
    return SplashBrand(
      popOpacity: const AlwaysStoppedAnimation<double>(1.0),
      popScale: const AlwaysStoppedAnimation<double>(1.0),
      pulseOpacity: const AlwaysStoppedAnimation<double>(0.5),
      pulseScale: const AlwaysStoppedAnimation<double>(1.0),
    );
  }
}

class _SettledLoader extends StatelessWidget {
  const _SettledLoader();

  @override
  Widget build(BuildContext context) {
    return SplashLoader(loadFill: const AlwaysStoppedAnimation<double>(1.0));
  }
}

Widget _host(Widget child, {bool dark = false}) => MaterialApp(
  theme: ThemeData.light(),
  darkTheme: ThemeData.dark(),
  themeMode: dark ? ThemeMode.dark : ThemeMode.light,
  locale: const Locale('ar'),
  home: Directionality(
    textDirection: TextDirection.rtl,
    child: child,
  ),
);

const _sizes = <String, Size>{
  'ref': Size(412, 892),
  'narrow': Size(375, 812),
  'tiny': Size(320, 640),
  'tall': Size(430, 932),
  // ألواح: الطرف الآخر من المدى.
  'tablet': Size(834, 1112),
  'tablet-landscape': Size(1194, 834),
};

void main() {
  group('SplashBackdrop', () {
    for (final dark in [false, true]) {
      for (final size in _sizes.entries) {
        testWidgets('يُبنى بلا تجاوز — ${dark ? 'داكن' : 'فاتح'} — ${size.key}',
            (tester) async {
          tester.view.physicalSize = size.value;
          tester.view.devicePixelRatio = 1.0;
          addTearDown(tester.view.reset);
          await tester.pumpWidget(
            _host(const Scaffold(body: SizedBox.expand(child: SplashBackdrop())), dark: dark),
          );
          expect(tester.takeException(), isNull);
        });
      }
    }
  });

  group('SplashBrand (الهوية)', () {
    for (final dark in [false, true]) {
      testWidgets('يُظهر الشعار والاسم والشعار النصّي بلا تجاوز — '
          '${dark ? 'داكن' : 'فاتح'}، RTL', (tester) async {
        tester.view.physicalSize = const Size(412, 892);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(
          _host(const Scaffold(body: Center(child: _SettledBrand())), dark: dark),
        );

        expect(find.text(_brandTitle), findsOneWidget);
        expect(find.text(_brandTagline), findsOneWidget);
        // الشعار (صورة العلامة) مرسوم مرّة.
        expect(find.byType(Image), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }

    for (final size in _sizes.entries) {
      testWidgets('لا تجاوز أفقي على ${size.key}', (tester) async {
        tester.view.physicalSize = size.value;
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(
          _host(const Scaffold(body: Center(child: _SettledBrand()))),
        );
        expect(tester.takeException(), isNull);
      });
    }
  });

  group('SplashLoader (التحميل)', () {
    // SplashLoader يسترجع `Positioned` — يجب أن يكون داخل Stack كما في الشاشة.
    Widget hostLoader(Widget child, {bool dark = false}) => _host(
      Scaffold(body: Stack(fit: StackFit.expand, children: [child])),
      dark: dark,
    );

    for (final dark in [false, true]) {
      testWidgets('يُظهر مسار التعبئة والشرح — ${dark ? 'داكن' : 'فاتح'}',
          (tester) async {
        tester.view.physicalSize = const Size(412, 892);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(
          hostLoader(const _SettledLoader(), dark: dark),
        );
        expect(find.text(_loadCaption), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }

    // [مخالفة مقصودة للمرجع] المرجع يبدأ من ٦٪ (`@keyframes og-load{from{
    // width:6%}}`)؛ بطلبٍ صريح من المستخدم أُزيلت إعادة الصياغة التي كانت
    // تُنتج ذلك، فصار `widthFactor` مطابقاً لقيمة الحركة الحقيقية بلا
    // تحوير — يبدأ من صفرٍ فعلي.
    testWidgets('[CRITICAL] بقرارٍ صريح: يبدأ الشريط من صفر بالمئة فعلياً',
        (tester) async {
      tester.view.physicalSize = const Size(412, 892);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        hostLoader(
          const SplashLoader(loadFill: AlwaysStoppedAnimation<double>(0.0)),
        ),
      );
      expect(tester.takeException(), isNull);
      final fill = tester.widget<FractionallySizedBox>(
        find.byType(FractionallySizedBox),
      );
      expect(fill.widthFactor, 0.0,
          reason: 'لا إعادة صياغة إلى ٦٪ — الصفر الحقيقي يُعرض صفراً');
    });

    // اكتُشف عبر التقاط الشاشة فعلياً ومسح بكسلاتها — لا بقراءة الشيفرة
    // وحدها — أن تعبئة الشريط كانت تُرسم بارتفاع صفر، فتبقى غير مرئية
    // البتّة رغم صحّة كل حساب آخر (النسبة، التوقيت، المنحنى). السبب:
    // `FractionallySizedBox` بلا `heightFactor` يمرّر قيداً غير مُحكَم
    // لولدٍ (`DecoratedBox`) بلا محتوى، فيأخذ أصغر ارتفاع ممكن — صفراً.
    testWidgets('[CRITICAL] تعبئة الشريط مرئية فعلياً — لا ترتفع صفراً',
        (tester) async {
      tester.view.physicalSize = const Size(412, 892);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        hostLoader(
          const SplashLoader(loadFill: AlwaysStoppedAnimation<double>(0.5)),
        ),
      );

      final fillBox = find.descendant(
        of: find.byType(FractionallySizedBox),
        matching: find.byType(DecoratedBox),
      );
      expect(fillBox, findsOneWidget);
      final size = tester.getSize(fillBox);
      expect(size.height, 5.0,
          reason: 'التعبئة يجب أن تملأ ارتفاع المسار (٥px) — لا صفراً');
      expect(size.width, greaterThan(0));
    });

    // [مخالفة مقصودة للمرجع] المرجع يُثبِّت التعبئة فيزيائياً على اليسار
    // (صندوق كتلة بهوامش صفرية، لا يتأثر بـ`dir="rtl"`) — تحقّقتُ من هذا
    // فعلياً بعرض الودجت ومسح بكسلاته، وكان مطابقاً. بطلبٍ صريح من
    // المستخدم بعد إطلاعه على هذا التطابق، عُكس الاتجاه عمداً: التثبيت
    // الآن على اليمين الفيزيائي، والتعبئة تكبر نحو اليسار. هذا الاختبار
    // يحرس القرار المعكوس **المقصود**، لا خطأً يُعاد إصلاحه لاحقاً.
    testWidgets(
        '[CRITICAL] بقرارٍ صريح: التعبئة تُثبَّت من اليمين وتكبر نحو اليسار',
        (tester) async {
      tester.view.physicalSize = const Size(412, 892);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        hostLoader(
          const SplashLoader(loadFill: AlwaysStoppedAnimation<double>(0.5)),
        ),
      );

      final align = tester.widget<Align>(find.byType(Align));
      expect(align.alignment, Alignment.centerRight,
          reason: 'انعكاسٌ مقصود عن المرجع — لا يُعاد إلى centerLeft');

      // تأكيد هندسي مباشر: حافة التعبئة اليمنى تلامس حافة المسار اليمنى،
      // وحافتها اليسرى في منتصف المسار تقريباً (لا إعادة صياغة إلى ٦٪ بعد
      // اليوم — `widthFactor` يساوي قيمة الحركة نفسها، ٠٫٥ هنا).
      final track = find.byType(Container).first;
      final trackRight = tester.getTopRight(track).dx;
      final fillRight = tester
          .getTopRight(
            find.descendant(
              of: find.byType(FractionallySizedBox),
              matching: find.byType(DecoratedBox),
            ),
          )
          .dx;
      expect(fillRight, closeTo(trackRight, 0.5),
          reason: 'التعبئة تبدأ من الحافة اليمنى للمسار، لا اليسرى');
    });

    testWidgets(
        '[CRITICAL] التدرّج وردي في أقصى اليسار وبنفسجي في أقصى اليمين — '
        '90deg الفيزيائي', (tester) async {
      // `linear-gradient(90deg, pink, violet)` في CSS زاويةٌ مطلقة لا تتأثر
      // باتجاه النص: الوردي دائماً في الطرف الفيزيائي الأيسر والبنفسجي في
      // الأيمن — **من صندوق التعبئة نفسه**، بصرف النظر عن أيّ طرفٍ من
      // المسار يُثبَّت عليه ذلك الصندوق. الانعكاس المقصود في الاختبار
      // السابق يغيّر أيّ حافةٍ من المسار تلامس الصندوق، لا توزيع اللونين
      // داخل الصندوق نفسه — فهذا الاختبار يبقى صحيحاً بلا تغيير.
      // استعمال `AppColors.primaryGradient` (قطريّ، مُعَدٌّ لأسطح أخرى) كان
      // يعكس هذا التوزيع على شريطٍ رفيعٍ كهذا.
      tester.view.physicalSize = const Size(412, 892);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        hostLoader(
          const SplashLoader(loadFill: AlwaysStoppedAnimation<double>(1.0)),
        ),
      );

      final box = tester.widget<DecoratedBox>(
        find.descendant(
          of: find.byType(FractionallySizedBox),
          matching: find.byType(DecoratedBox),
        ),
      );
      final gradient = (box.decoration as BoxDecoration).gradient
          as LinearGradient;
      expect(gradient.begin, Alignment.centerLeft);
      expect(gradient.end, Alignment.centerRight);
      expect(gradient.colors.first, AppColors.secondary,
          reason: 'الوردي في البداية (الطرف الأيسر الفيزيائي)');
      expect(gradient.colors.last, AppColors.primary,
          reason: 'البنفسجي في النهاية (الطرف الأيمن الفيزيائي)');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // الشاشة الكاملة — تحتاج DI + AuthCubit + رواتر لتصريف التنقل.
  // ─────────────────────────────────────────────────────────────────────────

  group('SplashScreen (الشاشة الكاملة)', () {
    late SharedPreferences prefs;

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      prefs = await SharedPreferences.getInstance();
      _registerOrReplace<OnboardingStorage>(OnboardingStorage(prefs));
      // لا ندخل الشبكة في الاختبار — نُسجّل نسختين بلا عمليات.
      _registerOrReplace<StoreSettingsRepository>(_NoopStoreSettings());
      _registerOrReplace<VisualsRepository>(_NoopVisuals());
    });

    tearDown(() {
      _unregister<OnboardingStorage>();
      _unregister<StoreSettingsRepository>();
      _unregister<VisualsRepository>();
    });

    testWidgets('يُبنى فاتحاً ويُظهر كل عناصر المرجع بلا تجاوز', (tester) async {
      final router = _SplashRouter();
      tester.view.physicalSize = const Size(412, 892);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(
        BlocProvider<AuthCubit>.value(
          value: _guestCubit(),
          child: MaterialApp.router(
            theme: ThemeData.light(),
            routerConfig: router.config(),
          ),
        ),
      );
      // نبضة الشعار مستمرة؛ ندفع مدة قصيرة فقط لفحص البناء، دون pumpAndSettle.
      await tester.pump(const Duration(milliseconds: 120));

      expect(find.text(_brandTitle), findsOneWidget);
      expect(find.text(_brandTagline), findsOneWidget);
      expect(find.text(_loadCaption), findsOneWidget);
      expect(find.byType(SplashBackdrop), findsOneWidget);
      expect(find.byType(SplashLoader), findsOneWidget);
      expect(tester.takeException(), isNull);

      // لتفريغ عدّاد `armSplash` (٢٫٣ ث) ونبضة الشعار قبل نهاية الاختبار.
      await tester.pump(SplashTiming.referenceTransitionDelay);
      await tester.pump(const Duration(milliseconds: 400));
    });

    testWidgets('بعد مدة المرجع ينتقل إلى التعريف (Onboarding)', (tester) async {
      final router = _SplashRouter();
      tester.view.physicalSize = const Size(412, 892);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(
        BlocProvider<AuthCubit>.value(
          value: _guestCubit(),
          child: MaterialApp.router(
            theme: ThemeData.light(),
            routerConfig: router.config(),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 120));

      // قبل تعدّي المدة ما زلنا على شاشة البداية.
      expect(router.current.name, SplashRoute.name);

      // ما زال خلفية/NavigationRoute مدمجة في رواتر الاختبار كوجهات مسجّلة.
      // [CRITICAL] الانتقال صار مشروطاً بتمام كل خطوات الإقلاع **و** بلوغ
      // الشريط نهايته — لا بمؤقّتٍ يسابق الحركة. لذلك يُنتظر التنعيم أيضاً.
      await tester.pump(SplashTiming.referenceTransitionDelay);
      await tester.pump(SplashTiming.progressEase);
      await tester.pump(const Duration(milliseconds: 200));

      // لا نصبّ Easy؛ يكفي أن العملية جرت دون اشتقاق/خروج:
      expect(router.current.name, OnboardingRoute.name,
          reason: 'لم ينتقل من شاشة البداية إلى التعريف بعد ٢٫٣ ثانية');
    });

    // بُنية الشاشة الكاملة تُعيد إنتاج حركات المرجع فعلياً (لا مجرّد وجودها):
    // الشعار يدخل بـ `og-pop .6s ease`، الهالة تنبض بـ `og-pulse 3s ease-in-out`،
    // الشريط يتقدم بـ `og-load 2.1s ease` من ٠٪ إلى ١٠٠٪ (بقرار المستخدم،
    // بدل ٦٪ في المرجع) — كلها تُقرأ من
    // الحالة الرأسية للشاشة نفسها في الزمن المحدد.

    Future<void> pumpSplash(WidgetTester tester) async {
      tester.view.physicalSize = const Size(412, 892);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        BlocProvider<AuthCubit>.value(
          value: _guestCubit(),
          child: MaterialApp.router(
            theme: ThemeData.light(),
            routerConfig: _SplashRouter().config(),
          ),
        ),
      );
      // نبضة العدّاد الأولى تُبلغ elapsed صفراً دائماً (يُثبَّت _startTime)؛
      // نبضة فارغة تُنشئ أُسّ الزمن قبل أي قياس للمدد.
      await tester.pump(Duration.zero);
    }

    // مسحّحات حالتَي الشاشة: داخل SplashBrand وبتتبّع العمق أول Fade/Scale هو
    // دخول `og-pop` وثانيهما نبض الهالة (أي انتقالات روتر خارج المكوّن مستبعدة).
    Finder brand(Type t) =>
        find.descendant(of: find.byType(SplashBrand), matching: find.byType(t));
    double popOpacityOf(WidgetTester tester) =>
        tester.widget<FadeTransition>(brand(FadeTransition).first)
            .opacity.value;
    double popScaleOf(WidgetTester tester) =>
        tester.widget<ScaleTransition>(brand(ScaleTransition).first)
            .scale.value;
    double pulseOpacityOf(WidgetTester tester) =>
        tester.widget<FadeTransition>(brand(FadeTransition).at(1))
            .opacity.value;
    double pulseScaleOf(WidgetTester tester) =>
        tester.widget<ScaleTransition>(brand(ScaleTransition).at(1))
            .scale.value;
    double barWidthFactorOf(WidgetTester t) =>
        t.widget<FractionallySizedBox>(find.byType(FractionallySizedBox))
            .widthFactor!;

    testWidgets('الشعار يدخل فعلياً بـ og-pop خلال ٦٠٠ms حتى التمام',
        (tester) async {
      await pumpSplash(tester);

      // في بداية الدخول: شفاف ومصغّر جزئياً، لكن داخل المدى لا خارجه.
      await tester.pump(const Duration(milliseconds: 120));
      expect(popOpacityOf(tester),
          allOf(greaterThan(0.0), lessThan(1.0)));
      expect(popScaleOf(tester),
          allOf(greaterThan(0.92), lessThan(1.0)));

      // بعد انتهاء ٦٠٠ms: دخولٌ تام (opacity=1، scale=1).
      await tester.pump(const Duration(milliseconds: 480));
      expect(popOpacityOf(tester), closeTo(1.0, 0.001));
      expect(popScaleOf(tester), closeTo(1.0, 0.001));

      // تصريف عدّاد `armSplash` قبل نهاية الاختبار.
      await tester.pump(SplashTiming.referenceTransitionDelay);
      await tester.pump(const Duration(milliseconds: 400));
    });

    testWidgets('الهالة تنبض og-pulse ٣ ثوانٍ بمنحنى ease-in-out المتماثل',
        (tester) async {
      await pumpSplash(tester);

      // بداية الدورة: القيمة الصغرى (opacity .35، scale .94).
      expect(pulseOpacityOf(tester), closeTo(0.35, 0.02));
      expect(pulseScaleOf(tester), closeTo(0.94, 0.01));

      // ربع الصعود (٧٥٠ms)، القمة (١·٥ث)، ثم ربع الهبوط (٢·٢٥ث) —
      // منتصف الهبوط يساوي منتصف الصعود: تماثل `ease-in-out` (لا نبض خطّي).
      await tester.pump(const Duration(milliseconds: 750));
      final quarterUpOpacity = pulseOpacityOf(tester);
      final quarterUpScale = pulseScaleOf(tester);
      await tester.pump(const Duration(milliseconds: 750));
      final midUpOpacity = pulseOpacityOf(tester);
      final midUpScale = pulseScaleOf(tester);
      await tester.pump(const Duration(milliseconds: 750));
      final quarterDownOpacity = pulseOpacityOf(tester);
      final quarterDownScale = pulseScaleOf(tester);

      expect(midUpOpacity, closeTo(0.9, 0.02), reason: 'قمة الصعود');
      expect(midUpScale, closeTo(1.04, 0.01), reason: 'قمة الصعود');
      expect(quarterUpOpacity, closeTo(quarterDownOpacity, 0.02),
          reason: 'تناظر ease-in-out نصفَي الدورة');
      expect(quarterUpScale, closeTo(quarterDownScale, 0.01),
          reason: 'تناظر ease-in-out نصفَي الدورة');
      expect(quarterUpOpacity,
          allOf(greaterThan(0.35), lessThan(0.9)),
          reason: 'منتصف الطريق بين الصغرى والعظمى');

      // تصريف عدّاد `armSplash` قبل نهاية الاختبار.
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(milliseconds: 400));
    });

    // [مخالفة مقصودة للمرجع] الأصل `@keyframes og-load{from{width:6%}}`؛
    // بطلبٍ صريح من المستخدم — الشريط بدا "سريعاً جداً ويبدأ من نحو ٦٪"
    // بصرياً — صار يبدأ من صفرٍ فعلي بلا إعادة صياغة. المدة (٢٫١ث) والمنحنى
    // (`ease`) لم يتغيّرا؛ هذا الاختبار يحرس القرار الجديد **المقصود**.
    // [CRITICAL] الشريط يمثّل عملاً منجزاً لا وقتاً مضى.
    //
    // كان هذان الاختباران يقيسان حركةً زمنية: تقدّمٌ خطّي على مدة ثابتة
    // (٢٫٣ث) تُقارَن بمؤقّت انتقالٍ مستقلّ بالمدة نفسها. وذاك بالضبط ما
    // كان معطوباً — رقمان لا يعرف أحدهما الآخر: المؤقّت يبدأ عند
    // `initState` والحركة لا تبدأ إلا مع أول إطار، فأيّ تأخّرٍ في أول إطار
    // يجعل الانتقال يسبق امتلاء الشريط.
    //
    // النية محفوظة وأقوى: لا امتلاء مبكّر يجلس ساكناً، ولا انتقال قبل
    // الامتلاء — لكنها تُقاس الآن على الشرط الحقيقي (تمام الخطوات) لا على
    // تزامن مؤقّتين.
    testWidgets('[CRITICAL] يبدأ من صفر ولا يبلغ ١٠٠٪ قبل تمام الخطوات',
        (tester) async {
      await pumpSplash(tester);

      await tester.pump(Duration.zero);
      final atStart = barWidthFactorOf(tester);
      expect(atStart, lessThan(1.0), reason: 'لا يبدأ ممتلئاً');

      // خطوة «لحظة الهوية» لم تتمّ بعد، فالشريط لا يجوز أن يكتمل مهما
      // مرّ من وقتٍ دونها.
      await tester.pump(
        SplashTiming.referenceTransitionDelay - const Duration(milliseconds: 200),
      );
      expect(barWidthFactorOf(tester), lessThan(1.0),
          reason: 'خطوة مطلوبة ناقصة — لا اكتمال');

      // بعد تمامها كلها: يكتمل.
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(SplashTiming.progressEase);
      expect(barWidthFactorOf(tester), closeTo(1.0, 0.001));
      await tester.pump(const Duration(milliseconds: 400));
    });

    testWidgets('[CRITICAL] الشريط يتقدّم فعلاً — لا يقفز ثم يتجمّد',
        (tester) async {
      // النية الأصلية: أن تُرى الحركة. تبقى محفوظة — لكن التقدّم صار
      // مرتبطاً بإنجازٍ حقيقي: كل خطوة تُتمّ ترفع القيمة.
      await pumpSplash(tester);
      await tester.pump(Duration.zero);
      final samples = <double>[barWidthFactorOf(tester)];

      for (var i = 0; i < 4; i++) {
        await tester.pump(const Duration(milliseconds: 250));
        samples.add(barWidthFactorOf(tester));
      }
      // القيمة لا تتراجع أبداً، وقد تحرّكت فعلاً عن نقطة البداية.
      for (var i = 1; i < samples.length; i++) {
        expect(samples[i], greaterThanOrEqualTo(samples[i - 1] - 0.001),
            reason: 'التقدّم لا يتراجع');
      }
      expect(samples.last, greaterThan(samples.first),
          reason: 'تحرّك فعلاً — لا شريط جامد');

      await tester.pump(SplashTiming.referenceTransitionDelay);
      await tester.pump(const Duration(milliseconds: 600));
    });



    testWidgets(
        '[CRITICAL] عطب ← «إعادة المحاولة» ← إقلاعٌ تامّ ← انتقال: خطوة الرسوم تُعاد فلا يبقى الشريط عند ٧٥٪',
        (tester) async {
      final router = _SplashRouter();
      tester.view.physicalSize = const Size(412, 892);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(
        BlocProvider<AuthCubit>.value(
          value: _brokenSessionCubit(),
          child: MaterialApp.router(
            theme: ThemeData.light(),
            routerConfig: router.config(),
          ),
        ),
      );
      // استعادة الجلسة تفشل فوراً — قبل أن تتمّ خطوة الرسوم أو لحظة الهوية.
      await tester.pump(Duration.zero);
      await tester.pump(SplashTiming.referenceTransitionDelay);
      await tester.pump(SplashTiming.progressEase);
      expect(find.text(_retryLabel), findsOneWidget, reason: 'حالة العطب لم تظهر');
      expect(router.current.name, SplashRoute.name);

      await tester.tap(find.text(_retryLabel));
      await tester.pump(Duration.zero);
      expect(find.text(_retryLabel), findsNothing, reason: 'العطب لم يُمسح عند إعادة المحاولة');

      await tester.pump(SplashTiming.referenceTransitionDelay);
      await tester.pump(SplashTiming.progressEase);
      await tester.pump(const Duration(milliseconds: 200));
      expect(router.current.name, OnboardingRoute.name,
          reason: 'بعد إعادة المحاولة لم ينتقل — خطوةٌ لم تُعَد فبقي الإقلاع ناقصاً');
      expect(tester.takeException(), isNull);
    });

    testWidgets('لا تبقى عدّادات أو مؤقتات بعد فك الشاشة (dispose كامل)',
        (tester) async {
      final router = _SplashRouter();
      tester.view.physicalSize = const Size(412, 892);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        BlocProvider<AuthCubit>.value(
          value: _guestCubit(),
          child: MaterialApp.router(
            theme: ThemeData.light(),
            routerConfig: router.config(),
          ),
        ),
      );

      // نبض الهالة مستمر — عدّاد فعّال أثناء العرض.
      await tester.pump(const Duration(milliseconds: 100));
      expect(tester.binding.transientCallbackCount, greaterThan(0));

      // يمرّ روت العروض، تُستبدل الشاشة وتُفكّ: لا نبض ولا عدّاد armSplash.
      await tester.pump(SplashTiming.referenceTransitionDelay);
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pump(const Duration(milliseconds: 100));
      expect(router.current.name, OnboardingRoute.name);
      // نسمح بفرص إضافية لإتمام إزالة الروت القديم وفكّ الشاشة قبل الفحص.
      for (var i = 0; i < 5 && tester.binding.transientCallbackCount != 0; i++) {
        await tester.pump(const Duration(milliseconds: 200));
      }
      expect(tester.binding.transientCallbackCount, 0,
          reason: 'بقيت كاميرا/عدّاد بعد فك الشاشة — تسريب');
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────
// أدوات الاختبار.
// ─────────────────────────────────────────────────────────────────────────

void _registerOrReplace<T extends Object>(T value) {
  if (sl.isRegistered<T>()) sl.unregister<T>();
  sl.registerSingleton<T>(value);
}

void _unregister<T extends Object>() {
  if (sl.isRegistered<T>()) sl.unregister<T>();
}

// نسختان لا تلمسان الشبكة — تستبدلان المستودعين الحقيقيين في الاختبار.
class _NoopStoreSettings extends StoreSettingsRepository {
  @override
  Future<StoreSocialLinks> refresh() async => links;
}

class _NoopVisuals extends VisualsRepository {
  @override
  Future<void> refresh() async {}
  @override
  Future<void> prefetch() async {}
}

// رواتر مصغّر: شاشة البداية بدايةً، ووجهتا التنقل (التعريف / الرئيسية)
// صفحات خفيفة تحمل نفس الاسم كي يتحقق الاستبدال بلا سحب الشاشات الكاملة.
class _SplashRouter extends RootStackRouter {
  @override
  List<AutoRoute> get routes => [
    AutoRoute(page: SplashRoute.page, path: '/', initial: true),
    AutoRoute(
      path: '/onboarding',
      page: PageInfo(
        OnboardingRoute.name,
        builder: (_) => const Scaffold(body: Center(child: Text('ONBOARDING'))),
      ),
    ),
    AutoRoute(
      path: '/main',
      page: PageInfo(
        MainNavigationRoute.name,
        builder: (_) => const Scaffold(body: Center(child: Text('MAIN'))),
      ),
    ),
  ];

  @override
  RouteType get defaultRouteType => const RouteType.material();
}

// ─── مصادقة ضيف (بلا جلسة محفوظة) — تكفي لدورة شاشة البداية ──────────────
AuthCubit _guestCubit() {
  final repo = _StubAuthRepository();
  return AuthCubit(
    localStorage: _GuestStorage(),
    loginUsecase: LoginUsecase(repo),
    registerUsecase: RegisterUsecase(repo),
    forgotPasswordUsecase: ForgotPasswordUsecase(repo),
    getMeUsecase: GetMeUsecase(repo),
    updateProfileUsecase: UpdateProfileUsecase(repo),
    changePasswordUsecase: ChangePasswordUsecase(repo),
  );
}

/// جلسةٌ محفوظة يتعذّر استعادتها **ويرمي** المخزن عند قراءة النسخة المحفوظة —
/// المسار الوحيد الذي يُخرج استثناءً من `loadSession` (هي تبتلع أخطاء الشبكة).
AuthCubit _brokenSessionCubit() {
  final repo = _StubAuthRepository();
  return AuthCubit(
    localStorage: _BrokenStorage(),
    loginUsecase: LoginUsecase(repo),
    registerUsecase: RegisterUsecase(repo),
    forgotPasswordUsecase: ForgotPasswordUsecase(repo),
    getMeUsecase: GetMeUsecase(_UnreachableAuthRepository()),
    updateProfileUsecase: UpdateProfileUsecase(repo),
    changePasswordUsecase: ChangePasswordUsecase(repo),
  );
}

class _BrokenStorage extends _GuestStorage {
  @override
  bool get isLoggedIn => true;
  @override
  String? getUserJson() => throw StateError('مخزن الجلسة تالف');
}

class _UnreachableAuthRepository extends _StubAuthRepository {
  @override
  Future<User> me() async => throw Exception('لا شبكة');
}

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

class _StubAuthRepository implements AuthRepository {
  @override
  Future<User> me() async => _user;
  @override
  Future<AuthSession> login(String phone, String password) async =>
      const AuthSession(token: 't', user: _user);
  @override
  Future<AccountRequestReceipt> register({
    required String username,
    required String phone,
    required String password,
    required String gender,
  }) async => const AccountRequestReceipt(id: 'req-1', status: 'pending', createdAt: null);
  @override
  Future<AccountRequestReceipt> forgotPassword({
    required String phone,
    required String username,
    required String gender,
    required String levelKey,
  }) async => const AccountRequestReceipt(id: 'req-1', status: 'pending', createdAt: null);
  @override
  Future<User> updateProfile({
    String? username,
    String? avatarUrl,
    bool clearAvatar = false,
    String? gender,
    String? preferredLanguage,
  }) async => _user;
  @override
  Future<AuthSession> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async => AuthSession(token: 't', user: await me());
}
