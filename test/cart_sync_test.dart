// CA-14 — مزامنة العربة النشطة في التطبيق (قرار المالك، STEP 59).
//
// الخادم مرجع الحقيقة؛ التطبيق طرفٌ في المزامنة لا سلطة. ما يُقاس هنا:
//   • الكيوبت يطبّق لقطة الخادم **ذرّياً** (حالةٌ واحدة لكل مزامنة) ويستنتج
//     رسالةً واحدة مجمَّعة: السعر بالمقارنة مع ما عُرض، والإزالة والخفض من
//     تقرير الخادم نفسه (`adjustments`).
//   • الحدّ الذي يهمّ فعلاً: ردّ HTTP حقيقي الشكل ← `CartRepositoryImpl` ←
//     `CartCubit` ← شاشة السلة (السعر والمجموع الظاهران) ← الشريط السفلي.
//   • متى تقع المزامنة: العودة للتطبيق، ومؤقّتٌ ما دام في المقدّمة والسلة غير
//     فارغة، وفتح تبويب السلة، وقبل الانتقال إلى الدفع — ولا شيء في الخلفية.

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:auto_route/auto_route.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/errors/app_exception.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/cart/data/repositories/cart_repository_impl.dart';
import 'package:otaku_galaxy/features/cart/domain/entities/cart_item.dart';
import 'package:otaku_galaxy/features/cart/domain/entities/cart_sync.dart';
import 'package:otaku_galaxy/features/cart/domain/repositories/cart_repository.dart';
import 'package:otaku_galaxy/features/cart/presentation/cart_auto_sync.dart';
import 'package:otaku_galaxy/features/cart/presentation/cubit/cart_cubit.dart';
import 'package:otaku_galaxy/features/cart/presentation/cubit/cart_state.dart';
import 'package:otaku_galaxy/features/cart/presentation/screens/cart_screen.dart';
import 'package:otaku_galaxy/core/router/app_router.dart';
import 'package:otaku_galaxy/features/main_navigation/presentation/screens/main_navigation_screen.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order_data.dart';
import 'package:otaku_galaxy/features/orders/data/repositories/order_repository_impl.dart';
import 'package:otaku_galaxy/features/orders/domain/repositories/order_repository.dart';
import 'package:otaku_galaxy/features/orders/domain/usecases/place_order_usecase.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';

import 'support/auth_stub.dart';

// ═══════════════════════ أدوات ═══════════════════════

CartItem _item(
  String line,
  String product, {
  double price = 10000,
  int quantity = 1,
  int stock = 10,
}) => CartItem(
  product: Product(
    id: product,
    name: 'منتج $product',
    description: '',
    price: price,
    images: const [],
    stock: stock,
  ),
  quantity: quantity,
  lineId: line,
);

/// مستودعٌ يعيد لقطات الخادم بالترتيب — وتبقى الأخيرة لكل استدعاء لاحق.
class _ScriptedCart implements CartRepository {
  _ScriptedCart(this.snapshots);

  final List<CartSnapshot> snapshots;
  int syncCalls = 0;

  /// إن وُجد لا تكتمل المزامنة حتى يكمله الاختبار.
  Completer<void>? gate;

  /// إن وُجد رُمي بدل الردّ (انقطاع).
  Object? failure;

  List<CartItem> mutationResult = const [];

  @override
  Future<CartSnapshot> syncCart() async {
    final index = syncCalls < snapshots.length ? syncCalls : snapshots.length - 1;
    syncCalls++;
    if (gate != null) await gate!.future;
    if (failure != null) throw failure!;
    return snapshots[index];
  }

  @override
  Future<List<CartItem>> fetchCart() async => (await syncCart()).items;

  @override
  Future<List<CartItem>> addToCart(
    String productId, {
    String? optionValue,
    int quantity = 1,
  }) async => mutationResult;

  @override
  Future<List<CartItem>> updateQuantity(String lineId, int quantity) async =>
      mutationResult;

  @override
  Future<List<CartItem>> removeFromCart(String lineId) async => mutationResult;
}

Future<CartCubit> _loaded(_ScriptedCart repo) async {
  final cubit = CartCubit(repo);
  await cubit.load();
  return cubit;
}

// ═══ خادمٌ مزيّف على مستوى HTTP — الشكل الذي يرسله `GET /cart` فعلاً ═══

class _CartServer implements HttpClientAdapter {
  double price = 10000;
  int quantity = 2;
  List<Map<String, Object?>> adjustments = [];
  int gets = 0;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    gets++;
    final items = quantity == 0
        ? <Object>[]
        : [
            {
              'id': 'l1',
              'productId': 'p1',
              'productName': 'حقيبة ناروتو',
              'productImage': null,
              'optionValue': null,
              'quantity': quantity,
              'unitPrice': price,
              'lineTotal': price * quantity,
              'stock': 10,
              'hasDeliveryPromo': false,
              'deliveryPromoAmount': 0,
            },
          ];
    final body = jsonEncode({
      'success': true,
      'data': {'items': items, 'adjustments': adjustments},
      'message': null,
    });
    adjustments = [];
    return ResponseBody.fromString(
      body,
      200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Future<(CartCubit, _CartServer, AuthCubit)> _pumpCartScreen(
  WidgetTester tester, {
  ValueNotifier<int>? tab,
  Duration interval = const Duration(seconds: 60),
}) async {
  tester.view.physicalSize = const Size(420, 1400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final server = _CartServer();
  final dio = Dio(BaseOptions(baseUrl: 'https://test.local/api'))
    ..httpClientAdapter = server;
  final cart = CartCubit(CartRepositoryImpl(api: ApiClient(dio: dio)));
  final auth = stubAuthCubit();
  await auth.loadSession();
  await tester.runAsync(cart.load);

  await tester.pumpWidget(
    MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>.value(value: auth),
        BlocProvider<CartCubit>.value(value: cart),
      ],
      child: MaterialApp(
        theme: AppTheme.light,
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: CartAutoSync(
            interval: interval,
            tabIndex: tab,
            cartTab: 3,
            child: const Scaffold(body: CartScreen()),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  return (cart, server, auth);
}

/// يترك طلب HTTP الحقيقي (خارج الساعة الوهمية) يكتمل ثم يعيد البناء.
Future<void> _settle(WidgetTester tester) async {
  await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}


// ═══ رواتر مصغّر لقياس الانتقالات فعلاً ═══

/// «بيانات الطلب» كصفحةٍ مسمّاة بالاسم نفسه — يكفي لقياس أن الزرّ انتقل.
class _CheckoutRouter extends RootStackRouter {
  _CheckoutRouter(this.start);

  final Widget start;

  @override
  List<AutoRoute> get routes => [
    AutoRoute(
      initial: true,
      path: '/start',
      page: PageInfo('StartRoute', builder: (_) => start),
    ),
    AutoRoute(
      path: '/order-data',
      page: PageInfo(
        OrderDataRoute.name,
        builder: (_) => const Scaffold(body: Text('ORDER-DATA')),
      ),
    ),
    AutoRoute(path: '/order-review', page: OrderReviewRoute.page),
  ];

  @override
  RouteType get defaultRouteType => const RouteType.material();
}

class _RejectingOrders implements OrderRepository {
  _RejectingOrders(this.error);

  final Object error;
  int calls = 0;

  @override
  Future<Order> placeOrder(OrderData data) async {
    calls++;
    throw error;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Future<_CheckoutRouter> _pumpRouter(
  WidgetTester tester, {
  required CartCubit cart,
  required Widget start,
  OrderRepository? orders,
}) async {
  tester.view.physicalSize = const Size(420, 1400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  final auth = stubAuthCubit();
  await auth.loadSession();
  final router = _CheckoutRouter(start);
  await tester.pumpWidget(
    MultiRepositoryProvider(
      providers: [
        RepositoryProvider.value(
          value: PlaceOrderUsecase(
            orders ?? _RejectingOrders(StateError('لا إرسال في هذا الاختبار')),
          ),
        ),
      ],
      child: MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<CartCubit>.value(value: cart),
        ],
        child: MaterialApp.router(
          theme: AppTheme.light,
          routerConfig: router.config(),
          builder: (context, child) =>
              Directionality(textDirection: TextDirection.rtl, child: child!),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return router;
}


// ═══ متجرٌ مزيّف على مستوى HTTP: `GET /cart` و`POST /orders` كما يردّ الخادم ═══

/// يقارن `expectedPrices` بسعره الحالي كما يفعل `orderService.create`، ويسجّل
/// كل طلبٍ وصله — لقياس ما أُرسل فعلاً على السلك لا ما نوت الشاشة إرساله.
class _ShopServer implements HttpClientAdapter {
  final Map<String, double> prices = {'p1': 10000, 'p2': 7000};
  final Map<String, int> quantities = {'p1': 2};

  /// يُجبر رفضاً بهذا الرمز (409) بغضّ النظر عن الأسعار.
  String? forcedConflict;
  Map<String, dynamic>? lastOrderBody;
  final List<String> requests = [];

  ResponseBody _json(int status, Object body) => ResponseBody.fromString(
    jsonEncode(body),
    status,
    headers: {
      Headers.contentTypeHeader: ['application/json'],
    },
  );

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add('${options.method} ${options.path}');
    if (options.method == 'GET' && options.path.endsWith('/cart')) {
      return _json(200, {
        'success': true,
        'data': {
          'items': [
            for (final entry in quantities.entries)
              {
                'id': 'l-${entry.key}',
                'productId': entry.key,
                'productName': 'منتج ${entry.key}',
                'productImage': null,
                'optionValue': null,
                'quantity': entry.value,
                'unitPrice': prices[entry.key],
                'lineTotal': prices[entry.key]! * entry.value,
                'stock': 10,
                'hasDeliveryPromo': false,
                'deliveryPromoAmount': 0,
              },
          ],
          'adjustments': <Object>[],
        },
        'message': null,
      });
    }
    if (options.method == 'POST' && options.path.endsWith('/orders')) {
      final body = Map<String, dynamic>.from(options.data as Map);
      lastOrderBody = body;
      if (forcedConflict != null) {
        return _json(409, {
          'success': false,
          'message': 'مخزون «منتج p1» غير كافٍ (المتاح: 1)',
          'error': {'code': forcedConflict},
        });
      }
      for (final expected in (body['expectedPrices'] as List? ?? const [])) {
        final e = expected as Map;
        if (prices[e['productId']] != (e['unitPrice'] as num).toDouble()) {
          return _json(409, {
            'success': false,
            'message': 'تغيّر سعر «منتج ${e['productId']}» — راجع سلتك قبل الإرسال',
            'error': {'code': 'PRODUCT_PRICE_CHANGED'},
          });
        }
      }
      return _json(201, {
        'success': true,
        'data': {'id': 'o1', 'number': '1001', 'status': 'PENDING_ADMIN_CONFIRMATION', 'items': <Object>[]},
        'message': 'تم استلام طلبك',
      });
    }
    return _json(404, {'success': false, 'message': 'غير موجود', 'error': {'code': 'NOT_FOUND'}});
  }

  @override
  void close({bool force = false}) {}
}

/// العربة والطلب على الخادم المزيّف نفسه، و«مراجعة الطلب» مبنيّة من العربة
/// المُزامَنة كما تبنيها شاشة البيانات (`OrderData.items = CartCubit.state.items`).
Future<(_CheckoutRouter, CartCubit, _ShopServer)> _pumpReviewOverWire(
  WidgetTester tester, {
  _ShopServer? shop,
  void Function(_ShopServer shop)? afterReviewBuilt,
}) async {
  final server = shop ?? _ShopServer();
  final dio = Dio(BaseOptions(baseUrl: 'https://test.local/api'))
    ..httpClientAdapter = server;
  final api = ApiClient(dio: dio);
  final cart = CartCubit(CartRepositoryImpl(api: api));
  await tester.runAsync(cart.load);
  final reviewed = OrderData(
    governorateId: 'g1',
    province: 'بغداد',
    deliveryCost: 5000,
    fullAddress: 'بغداد، الكرادة، قرب الجادرية',
    phone: '07701234567',
    items: cart.state.items,
  );
  afterReviewBuilt?.call(server);
  mainNavIndex.value = 0;
  final router = await _pumpRouter(
    tester,
    cart: cart,
    orders: OrderRepositoryImpl(api: api),
    start: const CartAutoSync(child: Scaffold(body: CartScreen())),
  );
  router.push(OrderReviewRoute(orderData: reviewed));
  await tester.pumpAndSettle();
  await tester.pump(const Duration(seconds: 5));
  await tester.pumpAndSettle();
  return (router, cart, server);
}

/// يؤكّد الإرسال ويترك طلبات HTTP (خارج الساعة الوهمية) والانتقالات تكتمل.
/// لا `pumpAndSettle`: شاشة النجاح تحمل حركةً مستمرّة لا تستقرّ.
Future<void> _confirmOverWire(WidgetTester tester) async {
  await tester.tap(find.text('تأكيد إرسال الطلب'));
  for (var i = 0; i < 6; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 30)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
  }
}

const _priceMsg = 'تم تحديث سعر أحد المنتجات في سلتك.';

void main() {
  // ═══════════════════ الكيوبت: تطبيق اللقطة والرسالة ═══════════════════

  group('CartCubit.sync — applies the server snapshot and reports what changed', () {
    test('unchanged price → cart unchanged, no notice', () async {
      final same = CartSnapshot(items: [_item('l1', 'p1', quantity: 2)]);
      final cubit = await _loaded(_ScriptedCart([same, same]));
      final notice = await cubit.sync();
      expect(notice?.hasChanges, isFalse);
      expect(cubit.state.items.single.product.price, 10000);
    });

    test('price increase → the line price and the total follow; the other line is untouched; price notice', () async {
      final cubit = await _loaded(_ScriptedCart([
        CartSnapshot(items: [_item('l1', 'p1', quantity: 2), _item('l2', 'p2', price: 7000)]),
        CartSnapshot(items: [_item('l1', 'p1', price: 12000, quantity: 2), _item('l2', 'p2', price: 7000)]),
      ]));
      expect(cubit.state.total, 27000);

      final notice = await cubit.sync();

      expect(notice!.priceChanged, isTrue);
      expect(notice.messageKeys, ['cartSyncPriceChanged']);
      expect(cubit.state.items.first.product.price, 12000);
      expect(cubit.state.items.first.lineTotal, 24000);
      expect(cubit.state.items.last.product.price, 7000);
      expect(cubit.state.total, 31000);
    });

    test('price decrease → the line follows and the customer is told', () async {
      final cubit = await _loaded(_ScriptedCart([
        CartSnapshot(items: [_item('l1', 'p1', quantity: 3)]),
        CartSnapshot(items: [_item('l1', 'p1', price: 8000, quantity: 3)]),
      ]));
      final notice = await cubit.sync();
      expect(notice!.priceChanged, isTrue);
      expect(cubit.state.total, 24000);
    });

    test('stock reached zero → the server removed the line; it disappears and the customer is told', () async {
      final cubit = await _loaded(_ScriptedCart([
        CartSnapshot(items: [_item('l1', 'p1', quantity: 2), _item('l2', 'p2')]),
        CartSnapshot(
          items: [_item('l2', 'p2')],
          adjustments: const [
            CartAdjustment(
              lineId: 'l1',
              productId: 'p1',
              reason: CartAdjustmentReason.unavailable,
              previousQuantity: 2,
              quantity: 0,
            ),
          ],
        ),
      ]));
      final notice = await cubit.sync();
      expect(notice!.itemRemoved, isTrue);
      expect(notice.priceChanged, isFalse);
      expect(cubit.state.items.map((i) => i.lineId), ['l2']);
      expect(cubit.state.total, 10000);
    });

    test('stock below the quantity → the reduced quantity is shown and the total recomputed', () async {
      final cubit = await _loaded(_ScriptedCart([
        CartSnapshot(items: [_item('l1', 'p1', quantity: 2)]),
        CartSnapshot(
          items: [_item('l1', 'p1', quantity: 1, stock: 1)],
          adjustments: const [
            CartAdjustment(
              lineId: 'l1',
              productId: 'p1',
              reason: CartAdjustmentReason.reduced,
              previousQuantity: 2,
              quantity: 1,
            ),
          ],
        ),
      ]));
      final notice = await cubit.sync();
      expect(notice!.quantityReduced, isTrue);
      expect(cubit.state.items.single.quantity, 1);
      expect(cubit.state.total, 10000);
    });

    test('stock still covers the quantity, or increases → quantity unchanged, no notice', () async {
      final cubit = await _loaded(_ScriptedCart([
        CartSnapshot(items: [_item('l1', 'p1', quantity: 2, stock: 2)]),
        CartSnapshot(items: [_item('l1', 'p1', quantity: 2, stock: 50)]),
      ]));
      final notice = await cubit.sync();
      expect(notice!.hasChanges, isFalse);
      expect(cubit.state.items.single.quantity, 2);
    });

    test('several changes in one synchronization → one consolidated notice', () async {
      final cubit = await _loaded(_ScriptedCart([
        CartSnapshot(items: [_item('l1', 'p1', quantity: 2), _item('l2', 'p2'), _item('l3', 'p3')]),
        CartSnapshot(
          items: [_item('l1', 'p1', quantity: 1), _item('l3', 'p3', price: 15000)],
          adjustments: const [
            CartAdjustment(lineId: 'l1', productId: 'p1', reason: CartAdjustmentReason.reduced, previousQuantity: 2, quantity: 1),
            CartAdjustment(lineId: 'l2', productId: 'p2', reason: CartAdjustmentReason.unavailable, previousQuantity: 1, quantity: 0),
          ],
        ),
      ]));
      final notices = <CartSyncNotice>[];
      final sub = cubit.notices.listen(notices.add);
      await cubit.sync();
      await Future<void>.delayed(Duration.zero);
      await sub.cancel();
      expect(notices, hasLength(1));
      expect(notices.single.messageKeys, [
        'cartSyncItemRemoved',
        'cartSyncQuantityReduced',
        'cartSyncPriceChanged',
      ]);
    });

    test('[CRITICAL] atomic: one synchronization emits exactly one state, never a half-updated cart', () async {
      final cubit = await _loaded(_ScriptedCart([
        CartSnapshot(items: [_item('l1', 'p1', quantity: 2), _item('l2', 'p2')]),
        CartSnapshot(items: [_item('l1', 'p1', price: 12000, quantity: 1)]),
      ]));
      final states = <CartState>[];
      final sub = cubit.stream.listen(states.add);
      await cubit.sync();
      await Future<void>.delayed(Duration.zero);
      await sub.cancel();
      expect(states, hasLength(1));
      expect(states.single.total, 12000);
    });

    test('concurrent synchronizations share one request', () async {
      final repo = _ScriptedCart([CartSnapshot(items: [_item('l1', 'p1')])]);
      final cubit = await _loaded(repo);
      repo.gate = Completer<void>();
      final a = cubit.sync();
      final b = cubit.sync();
      repo.gate!.complete();
      await Future.wait([a, b]);
      expect(repo.syncCalls, 2, reason: 'load + one shared sync');
    });

    test('a customer edit that lands during a synchronization is not overwritten by the older snapshot', () async {
      final repo = _ScriptedCart([
        CartSnapshot(items: [_item('l1', 'p1', quantity: 1)]),
      ]);
      final cubit = await _loaded(repo);
      repo.gate = Completer<void>();
      final inFlight = cubit.sync();
      repo.mutationResult = [_item('l1', 'p1', quantity: 2)];
      await cubit.increase('p1');
      repo.gate!.complete();
      await inFlight;
      expect(cubit.state.items.single.quantity, 2);
    });

    test('offline → the cart stays as it was, no notice', () async {
      final repo = _ScriptedCart([CartSnapshot(items: [_item('l1', 'p1', quantity: 2)])]);
      final cubit = await _loaded(repo);
      repo.failure = Exception('offline');
      expect(await cubit.sync(), isNull);
      expect(cubit.state.items.single.quantity, 2);
    });
  });

  // ═══════════════════ الحدّ الكامل: HTTP ← الكيوبت ← الشاشة ═══════════════════

  group('server change → HTTP → cart state → what the customer sees', () {
    testWidgets('price raised on the server: the cart screen shows the new price and total, with one message', (tester) async {
      final (_, server, _) = await _pumpCartScreen(tester);
      expect(find.text('20000 د.ع'), findsWidgets);

      server.price = 12000;
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await _settle(tester);

      expect(find.text('24000 د.ع'), findsWidgets);
      expect(find.text('20000 د.ع'), findsNothing);
      expect(find.text(_priceMsg), findsOneWidget);
    });

    testWidgets('stock reduced on the server: the new quantity is shown with the quantity message', (tester) async {
      final (_, server, _) = await _pumpCartScreen(tester);
      server
        ..quantity = 1
        ..adjustments = [
          {'lineId': 'l1', 'productId': 'p1', 'productName': 'حقيبة ناروتو', 'optionValue': null, 'reason': 'reduced', 'previousQuantity': 2, 'quantity': 1},
        ];
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await _settle(tester);

      expect(find.text('10000 د.ع'), findsWidgets);
      expect(find.textContaining('الكمية المتوفرة'), findsOneWidget);
    });

    testWidgets('product unavailable on the server: the line is gone and the customer is told', (tester) async {
      final (cart, server, _) = await _pumpCartScreen(tester);
      server
        ..quantity = 0
        ..adjustments = [
          {'lineId': 'l1', 'productId': 'p1', 'productName': 'حقيبة ناروتو', 'optionValue': null, 'reason': 'unavailable', 'previousQuantity': 2, 'quantity': 0},
        ];
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await _settle(tester);

      expect(cart.state.items, isEmpty);
      expect(find.text('حقيبة ناروتو'), findsNothing);
      expect(find.textContaining('لم يعد متوفراً'), findsOneWidget);
    });
  });

  // ═══════════════════ متى تقع المزامنة ═══════════════════

  group('when synchronization runs', () {
    testWidgets('a periodic tick synchronizes while the app is in the foreground', (tester) async {
      final (_, server, _) = await _pumpCartScreen(tester, interval: const Duration(seconds: 60));
      final before = server.gets;
      await tester.pump(const Duration(seconds: 61));
      await _settle(tester);
      expect(server.gets, before + 1);
    });

    testWidgets('no ticks while the app is in the background; a resume synchronizes at once', (tester) async {
      final (_, server, _) = await _pumpCartScreen(tester, interval: const Duration(seconds: 60));
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      final before = server.gets;
      await tester.pump(const Duration(minutes: 5));
      await _settle(tester);
      expect(server.gets, before, reason: 'لا طلبات والتطبيق في الخلفية');

      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await _settle(tester);
      expect(server.gets, before + 1);
    });

    testWidgets('opening the cart tab synchronizes', (tester) async {
      final tab = ValueNotifier<int>(0);
      final (_, server, _) = await _pumpCartScreen(tester, tab: tab);
      final before = server.gets;
      tab.value = 3;
      await _settle(tester);
      expect(server.gets, before + 1);
      tab.value = 1;
      await _settle(tester);
      expect(server.gets, before + 1, reason: 'تبويبٌ آخر لا يزامن');
    });

    testWidgets('an empty cart is not polled', (tester) async {
      final (cart, server, _) = await _pumpCartScreen(tester, interval: const Duration(seconds: 60));
      cart.clear();
      await tester.pump();
      final before = server.gets;
      await tester.pump(const Duration(minutes: 3));
      await _settle(tester);
      expect(server.gets, before);
    });
  });

  // ═══════════════════ قبل الدفع وعند رفضه ═══════════════════

  group('checkout: a last synchronization first, and the 409 safety net', () {
    testWidgets('«checkout» synchronizes first; a changed cart keeps the customer in the cart', (tester) async {
      final repo = _ScriptedCart([
        CartSnapshot(items: [_item('l1', 'p1', quantity: 2)]),
        CartSnapshot(items: [_item('l1', 'p1', price: 12000, quantity: 2)]),
      ]);
      final cart = await _loaded(repo);
      final router = await _pumpRouter(tester, cart: cart, start: const Scaffold(body: CartScreen()));

      await tester.tap(find.text('إتمام الطلب'));
      await tester.pumpAndSettle();

      expect(repo.syncCalls, 2);
      expect(router.current.name, 'StartRoute', reason: 'تغيّر السعر — يبقى في السلة ليراه');
      expect(find.text('24000 د.ع'), findsWidgets);
    });

    testWidgets('«checkout» on an unchanged cart proceeds to the order data', (tester) async {
      final repo = _ScriptedCart([CartSnapshot(items: [_item('l1', 'p1', quantity: 2)])]);
      final cart = await _loaded(repo);
      final router = await _pumpRouter(tester, cart: cart, start: const Scaffold(body: CartScreen()));

      await tester.tap(find.text('إتمام الطلب'));
      await tester.pumpAndSettle();

      expect(repo.syncCalls, 2);
      expect(router.current.name, OrderDataRoute.name);
    });

    testWidgets('[CRITICAL] a 409 cart conflict at submit: no retry from the stale review — the cart is synchronized and shown', (tester) async {
      final repo = _ScriptedCart([
        CartSnapshot(items: [_item('l1', 'p1', quantity: 2), _item('l2', 'p2')]),
        CartSnapshot(
          items: [_item('l2', 'p2')],
          adjustments: const [
            CartAdjustment(lineId: 'l1', productId: 'p1', reason: CartAdjustmentReason.unavailable, previousQuantity: 2, quantity: 0),
          ],
        ),
      ]);
      final cart = await _loaded(repo);
      final orders = _RejectingOrders(
        const AppException('«منتج p1» لم يعد متاحاً — أزله من العربة', statusCode: 409, code: 'PRODUCT_UNAVAILABLE'),
      );
      mainNavIndex.value = 0;
      final router = await _pumpRouter(
        tester,
        cart: cart,
        orders: orders,
        start: const Scaffold(body: SizedBox.shrink()),
      );
      router.push(OrderReviewRoute(
        orderData: OrderData(
          governorateId: 'g1',
          province: 'بغداد',
          deliveryCost: 5000,
          fullAddress: 'بغداد، الكرادة، قرب الجادرية',
          phone: '07701234567',
          items: cart.state.items,
        ),
      ));
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();

      await tester.tap(find.text('تأكيد إرسال الطلب'));
      await tester.pumpAndSettle();

      expect(orders.calls, 1);
      expect(repo.syncCalls, 2, reason: 'العربة زُومنت بعد الرفض');
      expect(cart.state.items.map((i) => i.lineId), ['l2']);
      expect(router.current.name, 'StartRoute', reason: 'لا بقاء على مراجعةٍ أسطرها قديمة');
      expect(mainNavIndex.value, 3, reason: 'يعود إلى تبويب السلة');
    });
  });

  // ═══════════════════ اتّساق السعر عند الإرسال (الخيار أ) ═══════════════════

  group('checkout price consistency — the reviewed prices travel with the order (option A)', () {
    test('1/8 · the order body carries the unit price of every reviewed line — and still no amount of its own', () {
      final body = OrderData(
        governorateId: 'g1',
        province: 'بغداد',
        deliveryCost: 5000,
        fullAddress: 'بغداد، الكرادة، قرب الجادرية',
        phone: '07701234567',
        items: [_item('l1', 'p1', quantity: 2), _item('l2', 'p2', price: 7000)],
      ).toJson();
      expect(body['expectedPrices'], [
        {'productId': 'p1', 'unitPrice': 10000.0},
        {'productId': 'p2', 'unitPrice': 7000.0},
      ]);
      for (final key in const ['items', 'total', 'productsTotal', 'discount', 'deliveryFee']) {
        expect(body.containsKey(key), isFalse, reason: '$key لا يُرسَل');
      }
    });

    testWidgets('2 · matching price → the order is placed; the wire carries the reviewed prices', (tester) async {
      final (_, _, shop) = await _pumpReviewOverWire(tester);
      await _confirmOverWire(tester);

      expect(find.text('تم إرسال طلبك'), findsOneWidget);
      expect(shop.lastOrderBody!['expectedPrices'], [
        {'productId': 'p1', 'unitPrice': 10000},
      ]);
    });

    testWidgets('[CRITICAL] 3–6 · price changed on the server → 409 PRODUCT_PRICE_CHANGED: cart synchronized, back to the cart at 12,000, customer told, no success', (tester) async {
      final (router, cart, shop) = await _pumpReviewOverWire(
        tester,
        afterReviewBuilt: (shop) => shop.prices['p1'] = 12000,
      );
      final beforeSubmit = shop.requests.length;
      await _confirmOverWire(tester);

      expect(find.text('تم إرسال طلبك'), findsNothing, reason: 'لا نجاح بعد 409');
      expect(shop.requests.sublist(beforeSubmit), ['POST /orders', 'GET /cart'],
          reason: 'الرفض ثم مزامنة العربة');
      expect(cart.state.items.single.product.price, 12000);
      expect(router.current.name, 'StartRoute', reason: 'عاد إلى السلة');
      expect(mainNavIndex.value, 3);
      expect(find.text('24000 د.ع'), findsWidgets, reason: 'السلة تعرض السعر الجديد');
      expect(find.text(_priceMsg), findsOneWidget, reason: 'الرسالة المجمَّعة نفسها');
    });

    testWidgets('5b · the price was already refreshed in the background → the customer is still told with the same price message', (tester) async {
      final (router, cart, shop) = await _pumpReviewOverWire(tester);
      shop.prices['p1'] = 12000;
      await tester.runAsync(cart.sync);
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 3)); // الشريط الأول انتهى
      await tester.pumpAndSettle();

      await _confirmOverWire(tester);

      expect(find.text('تم إرسال طلبك'), findsNothing);
      expect(router.current.name, 'StartRoute');
      expect(find.text(_priceMsg), findsOneWidget);
    });

    testWidgets('7 · a stock 409 keeps its own handling: synchronized, back to the cart, the server message — not the price message', (tester) async {
      final (router, _, shop) = await _pumpReviewOverWire(
        tester,
        afterReviewBuilt: (shop) => shop.forcedConflict = 'INSUFFICIENT_STOCK',
      );
      await _confirmOverWire(tester);

      expect(find.text('تم إرسال طلبك'), findsNothing);
      expect(shop.requests.last, 'GET /cart');
      expect(router.current.name, 'StartRoute');
      expect(find.text('مخزون «منتج p1» غير كافٍ (المتاح: 1)'), findsOneWidget);
      expect(find.text(_priceMsg), findsNothing);
    });

    testWidgets('8 · several lines each keep the price the customer reviewed', (tester) async {
      final shop = _ShopServer()..quantities['p2'] = 1;
      final (_, _, sent) = await _pumpReviewOverWire(tester, shop: shop);
      await _confirmOverWire(tester);
      expect(sent.lastOrderBody!['expectedPrices'], unorderedEquals([
        {'productId': 'p1', 'unitPrice': 10000},
        {'productId': 'p2', 'unitPrice': 7000},
      ]));
    });

    testWidgets('[CRITICAL] 9 · the reviewed price is sent — never re-read when the customer confirms', (tester) async {
      final (_, cart, shop) = await _pumpReviewOverWire(tester);
      // تحديثٌ في الخلفية بعد بناء المراجعة: العربة صارت 12,000 والمراجعة تعرض 10,000.
      shop.prices['p1'] = 12000;
      await tester.runAsync(cart.sync);
      await tester.pumpAndSettle();
      final beforeSubmit = shop.requests.length;

      await _confirmOverWire(tester);

      expect(shop.requests[beforeSubmit], 'POST /orders', reason: 'لا قراءة سعرٍ قبل الإرسال');
      expect(shop.lastOrderBody!['expectedPrices'], [
        {'productId': 'p1', 'unitPrice': 10000},
      ], reason: 'ما رآه الزبون في المراجعة، لا آخر سعرٍ في الذاكرة');
    });
  });
}
