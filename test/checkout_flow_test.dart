// مسار الشراء — الشاشتان الماليّتان.
//
// [CRITICAL] هاتان الشاشتان تحملان المال ولم تكن عليهما تغطية ويدجت إطلاقاً.
// ما يُقاس هنا سلوكُهما القائم كما هو، لا سلوكٌ مُعدَّل ليسهل اختباره:
// بوابةُ التحقق في «بيانات الطلب»، ومسارُ الإرسال في «مراجعة الطلب» بحالاته
// الأربع — جارٍ، ونجاح، وفشل، ومنعُ الإرسال المزدوج.
//
// قواعد التسعير نفسها يحرسها `business_rules_test.dart` والخلفيةُ اختباراتها،
// فلا تُكرَّر هنا. المقيس هو ما يظهر على الشاشة وما يُستدعى فعلاً.

import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get_it/get_it.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/errors/app_exception.dart';
import 'package:otaku_galaxy/core/router/app_router.dart';
import 'package:otaku_galaxy/features/birthday/data/birthday_storage.dart';
import 'package:otaku_galaxy/features/cart/domain/entities/cart_item.dart';
import 'package:otaku_galaxy/features/cart/domain/repositories/cart_repository.dart';
import 'package:otaku_galaxy/features/cart/presentation/cubit/cart_cubit.dart';
import 'package:otaku_galaxy/features/checkout/presentation/screens/order_review_screen.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order_data.dart';
import 'package:otaku_galaxy/features/orders/domain/repositories/order_repository.dart';
import 'package:otaku_galaxy/features/orders/domain/usecases/place_order_usecase.dart';
import 'package:otaku_galaxy/features/products/domain/entities/governorate.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';
import 'package:otaku_galaxy/features/products/domain/repositories/governorate_repository.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_governorates_usecase.dart';

import 'support/auth_stub.dart';
import 'support/render_harness.dart';

// ═══════════════════════ بدائل الطبقة السفلى ═══════════════════════

Product _product({String id = 'p1', double price = 15000}) => Product(
  id: id,
  name: 'منتج اختبار',
  description: 'وصف',
  price: price,
  categoryId: 'c1',
  stock: 10,
  images: const [],
);

CartItem _item({int quantity = 2}) =>
    CartItem(product: _product(), quantity: quantity, lineId: 'l1');

/// مستودع طلبات يتحكّم الاختبار بنتيجته وتوقيتها.
class _StubOrderRepository implements OrderRepository {
  _StubOrderRepository({this.error, this.gate});

  /// إن وُجد رُمي بدل النجاح.
  final Object? error;

  /// إن وُجد لم يكتمل الإرسال حتى يكمله الاختبار — لقياس حالة «جارٍ».
  final Completer<void>? gate;

  int placeCalls = 0;
  OrderData? lastData;

  @override
  Future<Order> placeOrder(OrderData data) async {
    placeCalls++;
    lastData = data;
    if (gate != null) await gate!.future;
    if (error != null) throw error!;
    return const Order(
      id: 'o1',
      number: '1001',
      province: 'بغداد',
      deliveryCost: 5000,
      fullAddress: 'بغداد، الكرادة، قرب الجادرية',
      phone: '07701234567',
      total: 35000,
      status: OrderStatus.waitingAdmin,
    );
  }

  @override
  Future<List<Order>> fetchMyOrders() async => const [];
  @override
  Future<Order> fetchOrderDetails(String id) async => throw UnimplementedError();
  @override
  Future<Order?> fetchPendingConfirmation() async => null;
  @override
  Future<Order> confirmReceipt(String id) async => throw UnimplementedError();
}

class _StubGovernorates implements GovernorateRepository {
  @override
  Future<List<Governorate>> fetchGovernorates() async => const [
    Governorate(id: 'g1', name: 'بغداد', deliveryFee: 5000),
  ];

  /// بلا مناطق — المحافظة غير مقسّمة، وهو المسار الأبسط في الشاشة.
  @override
  Future<List<DeliveryZone>> fetchZones(String governorateId) async => const [];
}

class _StubCart implements CartRepository {
  @override
  Future<List<CartItem>> fetchCart() async => [_item()];
  @override
  Future<List<CartItem>> addToCart(
    String productId, {
    int quantity = 1,
    String? optionValue,
  }) async => [_item()];
  @override
  Future<List<CartItem>> updateQuantity(String lineId, int quantity) async => [
    _item(),
  ];
  @override
  Future<List<CartItem>> removeFromCart(String lineId) async => const [];
}

OrderData _orderData({double discount = 0, double deliveryDiscount = 0}) =>
    OrderData(
      governorateId: 'g1',
      province: 'بغداد',
      deliveryCost: 5000,
      fullAddress: 'بغداد، الكرادة، قرب الجادرية',
      phone: '07701234567',
      items: [_item()],
      discount: discount,
      deliveryDiscount: deliveryDiscount,
    );

// ═══════════════════════ حوامل العرض ═══════════════════════

/// رواتر مصغّر يضم شاشتَي الشراء الحقيقيتين كي يتوفّر `context.router`
/// وتُقاس الانتقالة إلى «مراجعة الطلب» فعلياً لا بالنيّة.
class _CheckoutRouter extends RootStackRouter {
  @override
  List<AutoRoute> get routes => [
    AutoRoute(
      initial: true,
      path: '/start',
      page: PageInfo(
        'StartPlaceholderRoute',
        builder: (_) => const Scaffold(body: SizedBox.shrink()),
      ),
    ),
    AutoRoute(path: '/order-data', page: OrderDataRoute.page),
    AutoRoute(path: '/order-review', page: OrderReviewRoute.page),
  ];

  @override
  RouteType get defaultRouteType => const RouteType.material();
}

Widget _wrap({required Widget child, required CartCubit cart}) =>
    MultiBlocProvider(
      providers: [
        BlocProvider<CartCubit>.value(value: cart),
        BlocProvider.value(value: stubAuthCubit()),
      ],
      child: child,
    );

List<Locale> get _locales => const [Locale('ar')];

List<LocalizationsDelegate<dynamic>> get _delegates => const [
  GlobalMaterialLocalizations.delegate,
  GlobalWidgetsLocalizations.delegate,
  GlobalCupertinoLocalizations.delegate,
];

/// «مراجعة الطلب» وحدها — لا تلمس `context.router` أثناء البناء.
/// [skipCountdown] يتجاوز عدّاد الخمس ثوانٍ (يقيسه اختبار العدّاد وحده)
/// حتى تبقى بقية الاختبارات على زرٍّ مفعَّل كما كانت.
Future<void> _pumpReview(
  WidgetTester tester, {
  required _StubOrderRepository orders,
  OrderData? data,
  bool skipCountdown = true,
}) async {
  tester.view.physicalSize = const Size(390, 1400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final cart = CartCubit(_StubCart());
  await tester.pumpWidget(
    MultiRepositoryProvider(
      providers: [
        RepositoryProvider.value(value: PlaceOrderUsecase(orders)),
      ],
      child: _wrap(
        cart: cart,
        child: MaterialApp(
          theme: AppTheme.light,
          locale: const Locale('ar'),
          supportedLocales: _locales,
          localizationsDelegates: _delegates,
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: OrderReviewScreen(orderData: data ?? _orderData()),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  if (skipCountdown) {
    await tester.pump(const Duration(seconds: 5));
    await tester.pump();
  }
}

/// «بيانات الطلب» داخل رواتر حقيقي كي تُقاس الانتقالة عند نجاح التحقق.
Future<_CheckoutRouter> _pumpData(WidgetTester tester) async {
  tester.view.physicalSize = const Size(390, 1800);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final router = _CheckoutRouter();
  final cart = CartCubit(_StubCart());
  await cart.load();

  await tester.pumpWidget(
    MultiRepositoryProvider(
      providers: [
        RepositoryProvider.value(
          value: FetchGovernoratesUsecase(_StubGovernorates()),
        ),
        RepositoryProvider.value(
          value: PlaceOrderUsecase(_StubOrderRepository()),
        ),
      ],
      child: _wrap(
        cart: cart,
        child: MaterialApp.router(
          theme: AppTheme.light,
          locale: const Locale('ar'),
          supportedLocales: _locales,
          localizationsDelegates: _delegates,
          routerConfig: router.config(),
        ),
      ),
    ),
  );
  await tester.pump();
  router.push(const OrderDataRoute());
  await tester.pumpAndSettle();
  return router;
}

void main() {
  // [CRITICAL] بلا خطوط المشروع يقيس `flutter test` العربية بخطٍّ بديل
  // متساوي العرض، فتظهر تجاوزاتُ تخطيطٍ وهمية لا وجود لها على الجهاز.
  // انظر التعليق في `support/render_harness.dart`.
  setUpAll(loadProjectFonts);

  // الشاشة تقرأ حالة الميلاد من محدِّد الخدمات مباشرةً؛ نسخةٌ حقيقية تكفي
  // لأن `refresh()` تبتلع فشل الشبكة وتُبقي آخر نسخة معروفة.
  setUp(() async {
    await GetIt.I.reset();
    GetIt.I.registerSingleton<BirthdayStorage>(BirthdayStorage());
  });
  tearDown(() => GetIt.I.reset());

  // ═══════════════ بيانات الطلب — بوابة التحقق ═══════════════

  group('OrderDataScreen — بوابة التحقق', () {
    testWidgets('حقول ناقصة تمنع المتابعة وتُظهر رسائل الحقول', (tester) async {
      await _pumpData(tester);

      await tester.tap(find.widgetWithText(AnimePrimaryButton, 'مراجعة الطلب'));
      await tester.pumpAndSettle();

      // رسائل التحقق القائمة كما هي — لا تُعاد صياغتها لأجل الاختبار.
      expect(find.text('يرجى إدخال رقم الهاتف'), findsOneWidget);
      expect(find.text('يرجى إدخال العنوان الكامل'), findsOneWidget);

      // ولم ننتقل — زرّ المتابعة يحمل نصّ «مراجعة الطلب» نفسه الذي
      // تحمله الشاشة التالية، فالحكم بالنوع لا بالنصّ.
      expect(find.byType(OrderReviewScreen), findsNothing);
    });

    testWidgets('قيم قصيرة مرفوضة برسائلها الخاصة', (tester) async {
      await _pumpData(tester);

      await tester.enterText(find.byType(TextFormField).first, '0770');
      // حدّ العنوان هو حدّ الخادم (`fullAddress.min(5)`): «بغداد» (٥ أحرف)
      // صار مقبولاً كما يقبله الخادم، فالقصير هنا أقلّ من ذلك.
      await tester.enterText(find.byType(TextFormField).last, 'بغد');
      await tester.tap(find.widgetWithText(AnimePrimaryButton, 'مراجعة الطلب'));
      await tester.pumpAndSettle();

      expect(find.text('رقم الهاتف غير صحيح'), findsOneWidget);
      expect(find.text('العنوان قصير جداً'), findsOneWidget);
      expect(find.byType(OrderReviewScreen), findsNothing);
    });

    testWidgets('[CRITICAL] حقول صحيحة بلا محافظة لا تُنشئ طلباً', (
      tester,
    ) async {
      await _pumpData(tester);

      await tester.enterText(find.byType(TextFormField).first, '07701234567');
      await tester.enterText(
        find.byType(TextFormField).last,
        'بغداد، الكرادة، قرب الجادرية',
      );
      await tester.tap(find.widgetWithText(AnimePrimaryButton, 'مراجعة الطلب'));
      await tester.pumpAndSettle();

      // الحقلان سليمان فلا رسائل حقول…
      expect(find.text('يرجى إدخال رقم الهاتف'), findsNothing);
      expect(find.text('العنوان قصير جداً'), findsNothing);
      // …ومع ذلك لا انتقال: المحافظة صفُّ اختيار لا حقلَ نموذج، وحارسها
      // منفصل. هذا بالضبط ما يمنع إرسال `governorateId: ''` إلى الخادم.
      expect(find.byType(OrderReviewScreen), findsNothing);
    });

    testWidgets('بيانات كاملة تنتقل إلى مراجعة الطلب', (tester) async {
      await _pumpData(tester);

      await tester.enterText(find.byType(TextFormField).first, '07701234567');
      await tester.enterText(
        find.byType(TextFormField).last,
        'بغداد، الكرادة، قرب الجادرية',
      );
      await tester.pumpAndSettle();

      // اختيار المحافظة من ورقة الاختيار الحقيقية.
      await tester.tap(find.text('اختر المحافظة'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('بغداد').last);
      await tester.pumpAndSettle();

      await tester.tap(find.widgetWithText(AnimePrimaryButton, 'مراجعة الطلب'));
      await tester.pumpAndSettle();

      expect(find.byType(OrderReviewScreen), findsOneWidget);
    });
  });

  // ═══════════════ مراجعة الطلب — مسار الإرسال ═══════════════

  group('OrderReviewScreen — عدّاد الخمس ثوانٍ', () {
    AnimePrimaryButton confirmButton(WidgetTester tester) =>
        tester.widget<AnimePrimaryButton>(
          find.widgetWithText(AnimePrimaryButton, 'تأكيد إرسال الطلب'),
        );

    testWidgets('[CRITICAL] الزرّ معطّل خمس ثوانٍ بالضبط ثم يُفعَّل', (
      tester,
    ) async {
      final orders = _StubOrderRepository();
      await _pumpReview(tester, orders: orders, skipCountdown: false);

      // لحظة الفتح: معطّل، والعدّاد يقول ٥.
      expect(confirmButton(tester).onPressed, isNull);
      expect(find.textContaining('5 ثانية'), findsOneWidget);

      // نقرة مبكّرة لا تُرسل شيئاً.
      await tester.tap(find.text('تأكيد إرسال الطلب'), warnIfMissed: false);
      await tester.pump();
      expect(orders.placeCalls, 0);

      await tester.pump(const Duration(milliseconds: 2600));
      expect(confirmButton(tester).onPressed, isNull);
      expect(find.textContaining('3 ثانية'), findsOneWidget, reason: 'التقريب للأعلى');

      await tester.pump(const Duration(milliseconds: 2300));
      expect(confirmButton(tester).onPressed, isNull, reason: '4.9 ثانية لا تكفي');

      await tester.pump(const Duration(milliseconds: 200));
      expect(confirmButton(tester).onPressed, isNotNull, reason: 'بعد ٥ ثوانٍ');
      expect(find.textContaining('ثانية'), findsNothing, reason: 'العدّاد يختفي');

      await tester.tap(find.text('تأكيد إرسال الطلب'));
      await tester.pump();
      expect(orders.placeCalls, 1);
    });

    testWidgets('[a11y] الإعلان الحيّ مرةً عند الفتح — لا كل ثانية', (tester) async {
      // قارئ الشاشة يعلن كل تغيّرٍ في نصّ منطقةٍ حيّة. عدّادٌ حيّ طوال
      // الخمس ثوانٍ يعني خمسة إعلانات تقطع ما يقرؤه المستخدم. المطلوب:
      // إعلانٌ واحد عند الفتح («بعد ٥ ثوانٍ»)، ويبقى النصّ مقروءاً عند
      // التركيز في كل لحظة بقيمته الصحيحة.
      final semantics = tester.ensureSemantics();
      final orders = _StubOrderRepository();
      await _pumpReview(tester, orders: orders, skipCountdown: false);

      List<String> liveLabels() {
        final out = <String>[];
        void visit(SemanticsNode node) {
          final data = node.getSemanticsData();
          if (data.flagsCollection.isLiveRegion && data.label.isNotEmpty) {
            out.add(data.label);
          }
          node.visitChildren((child) {
            visit(child);
            return true;
          });
        }
        visit(tester.getSemantics(find.byType(OrderReviewScreen)));
        return out;
      }

      // لحظة الفتح: منطقةٌ حيّة واحدة تحمل الخمس ثوانٍ.
      final opening = liveLabels();
      expect(opening, hasLength(1));
      expect(opening.single, contains('5'));

      // في كل ثانيةٍ لاحقة: النصّ موجود ومقروء لكنه **ليس** حيّاً.
      for (final expected in ['4', '3', '2', '1']) {
        await tester.pump(const Duration(seconds: 1));
        expect(find.textContaining('$expected ثانية'), findsOneWidget);
        expect(liveLabels(), isEmpty, reason: 'لا إعلان عند $expected');
      }

      await tester.pump(const Duration(seconds: 1));
      expect(confirmButton(tester).onPressed, isNotNull);
      expect(liveLabels(), isEmpty);
      semantics.dispose();
    });

    testWidgets('الشريط ينفد بسلاسة مع الإطارات — لا خمس قفزات', (tester) async {
      // العينات كل ١٠٠ مللي ثانية لا تعتمد على توقيت إطارٍ بعينه: المطلوب
      // أن تتناقص القيمة مع **كل** عينة (لا ثبات لثانيةٍ ثم قفزة)، وأن تكون
      // كل خطوة صغيرة (≈ ٠٫٠٢ لا ٠٫٢)، وأن يقطع الشريط نصفه عند منتصف المهلة.
      final orders = _StubOrderRepository();
      await _pumpReview(tester, orders: orders, skipCountdown: false);

      double barValue() =>
          tester.widget<AnimeLinearProgress>(find.byType(AnimeLinearProgress)).value!;

      final samples = <double>[barValue()];
      for (var i = 0; i < 49; i++) {
        await tester.pump(const Duration(milliseconds: 100));
        samples.add(barValue());
      }
      expect(samples.first, 1.0);
      for (var i = 1; i < samples.length; i++) {
        final step = samples[i - 1] - samples[i];
        expect(step, greaterThan(0), reason: 'العينة $i لم تتحرّك');
        expect(step, lessThan(0.05), reason: 'العينة $i قفزت $step');
      }
      expect(samples.toSet().length, samples.length, reason: 'لا قيمتان متساويتان');
      // عند ٢٫٥ ثانية (العينة ٢٥) نصف الشريط تقريباً.
      expect(samples[25], closeTo(0.5, 0.05));
      // وعند اكتمال الخمس ثوانٍ يختفي الشريط ويُفعَّل الزرّ.
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.byType(AnimeLinearProgress), findsNothing);
      expect(confirmButton(tester).onPressed, isNotNull);
    });

    testWidgets('العدّاد لا يُعاد ضبطه بإعادة البناء', (tester) async {
      final orders = _StubOrderRepository();
      await _pumpReview(tester, orders: orders, skipCountdown: false);
      await tester.pump(const Duration(seconds: 3));
      // إعادة بناء لأي سبب (تبديل مظهر، لغة…) — نفس الحالة، لا بداية جديدة.
      tester.state<State<OrderReviewScreen>>(find.byType(OrderReviewScreen))
          // ignore: invalid_use_of_protected_member
          .setState(() {});
      await tester.pump();
      expect(find.textContaining('2 ثانية'), findsOneWidget);
      await tester.pump(const Duration(seconds: 2));
      expect(confirmButton(tester).onPressed, isNotNull);
    });
  });

  group('OrderReviewScreen — مسار الإرسال', () {
    testWidgets('ملخّص الأسعار يعرض القيم المرسلة', (tester) async {
      final orders = _StubOrderRepository();
      await _pumpReview(tester, orders: orders, data: _orderData(discount: 3000));
      await tester.pumpAndSettle();

      // منتجات ٣٠٬٠٠٠ + توصيل ٥٬٠٠٠ − خصم ٣٬٠٠٠ = ٣٢٬٠٠٠.
      expect(find.text('سعر المنتجات'), findsOneWidget);
      expect(find.text('رسوم التوصيل'), findsOneWidget);
      expect(find.text('الخصم'), findsOneWidget);
      expect(find.text('المجموع النهائي'), findsOneWidget);
      expect(find.textContaining('32'), findsWidgets);
    });

    testWidgets('التأكيد يرسل الطلب ويعرض صفحة النجاح ويفرّغ السلة', (
      tester,
    ) async {
      final orders = _StubOrderRepository();
      await _pumpReview(tester, orders: orders);
      await tester.pumpAndSettle();

      await tester.tap(find.text('تأكيد إرسال الطلب'));
      // صفحة النجاح تحمل حركةً دائمة (`repeat`)، فلا تستقرّ أبداً:
      // نضخّ إطارات محدودة بدل `pumpAndSettle`.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(orders.placeCalls, 1);
      // البيانات وصلت كما هي — لا يعيد التطبيق حسابها.
      expect(orders.lastData!.governorateId, 'g1');
      expect(orders.lastData!.phone, '07701234567');
      // وصفحة النجاح حلّت محل الشاشة.
      expect(find.text('تم إرسال طلبك'), findsOneWidget);
      expect(find.text('تأكيد إرسال الطلب'), findsNothing);
    });

    testWidgets('[CRITICAL] حالة «جارٍ» تظهر ولا يُرسل الطلب مرتين', (
      tester,
    ) async {
      final gate = Completer<void>();
      final orders = _StubOrderRepository(gate: gate);
      await _pumpReview(tester, orders: orders);
      await tester.pumpAndSettle();

      await tester.tap(find.text('تأكيد إرسال الطلب'));
      await tester.pump();

      // الإرسال جارٍ: مؤشّر بدل النصّ.
      expect(find.byType(CircularProgressIndicator), findsWidgets);
      expect(orders.placeCalls, 1);

      // ضغطة ثانية أثناء الإرسال — الزرّ معطَّل (`onPressed: null`) فلا أثر.
      await tester.tap(find.byType(AnimePrimaryButton), warnIfMissed: false);
      await tester.pump();
      expect(orders.placeCalls, 1, reason: 'لا إرسال مزدوج');

      gate.complete();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(orders.placeCalls, 1);
      expect(find.text('تم إرسال طلبك'), findsOneWidget);
    });

    testWidgets('فشل الإرسال يُظهر رسالة الخادم ويُبقي الشاشة', (tester) async {
      final orders = _StubOrderRepository(
        error: const AppException('المخزون غير كافٍ'),
      );
      await _pumpReview(tester, orders: orders);
      await tester.pumpAndSettle();

      await tester.tap(find.text('تأكيد إرسال الطلب'));
      await tester.pumpAndSettle();

      // رسالة الخادم نفسها لا نصٌّ عام — هذا سلوك الشاشة القائم.
      expect(find.text('المخزون غير كافٍ'), findsOneWidget);
      // الشاشة باقية والزرّ عاد قابلاً للضغط.
      expect(find.text('تأكيد إرسال الطلب'), findsOneWidget);
      expect(find.text('تم إرسال طلبك'), findsNothing);
    });

    testWidgets('خطأ منطقة التوصيل يُترجم إلى رسالته المخصّصة', (tester) async {
      final orders = _StubOrderRepository(
        error: const AppException('zone', code: 'ZONE_INVALID'),
      );
      await _pumpReview(tester, orders: orders);
      await tester.pumpAndSettle();

      await tester.tap(find.text('تأكيد إرسال الطلب'));
      await tester.pumpAndSettle();

      expect(
        find.text('منطقة التوصيل غير صالحة لهذه المحافظة.'),
        findsOneWidget,
      );
    });

    testWidgets('فشلٌ ثم إعادة محاولة ناجحة تُرسل مرة ثانية فقط', (
      tester,
    ) async {
      // يثبّت أن `_loading` يعود إلى false في `finally` — بدونه يبقى الزرّ
      // معطَّلاً بعد أول فشل ولا يستطيع العميل إعادة المحاولة أبداً.
      final orders = _StubOrderRepository(
        error: const AppException('تعذر الاتصال'),
      );
      await _pumpReview(tester, orders: orders);
      await tester.pumpAndSettle();

      await tester.tap(find.text('تأكيد إرسال الطلب'));
      await tester.pumpAndSettle();
      expect(orders.placeCalls, 1);

      await tester.tap(find.text('تأكيد إرسال الطلب'));
      await tester.pumpAndSettle();
      expect(orders.placeCalls, 2, reason: 'الزرّ لم يبقَ معطَّلاً بعد الفشل');
    });
  });
}
