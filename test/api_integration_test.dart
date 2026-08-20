import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';
import 'package:otaku_galaxy/core/errors/app_exception.dart';
import 'package:otaku_galaxy/features/auth/data/repositories/auth_repository_impl.dart';
import 'package:otaku_galaxy/features/auth/domain/repositories/auth_repository.dart';
import 'package:otaku_galaxy/features/cart/data/repositories/cart_repository_impl.dart';
import 'package:otaku_galaxy/features/cart/domain/repositories/cart_repository.dart';
import 'package:otaku_galaxy/features/cart/presentation/cubit/cart_cubit.dart';
import 'package:otaku_galaxy/features/cart/presentation/cubit/cart_state.dart';
import 'package:otaku_galaxy/features/favorites/data/repositories/favorites_repository_impl.dart';
import 'package:otaku_galaxy/features/favorites/domain/repositories/favorites_repository.dart';
import 'package:otaku_galaxy/features/orders/data/repositories/order_repository_impl.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order_data.dart';
import 'package:otaku_galaxy/features/orders/domain/repositories/order_repository.dart';
import 'package:otaku_galaxy/features/products/data/repositories/governorate_repository_impl.dart';
import 'package:otaku_galaxy/features/products/data/repositories/product_repository_impl.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';
import 'package:otaku_galaxy/features/products/domain/repositories/governorate_repository.dart';
import 'package:otaku_galaxy/features/products/domain/repositories/product_repository.dart';

/// فحص تكاملي شامل: يشغّل طبقة البيانات الحقيقية (Dio + المستودعات + النماذج)
/// ضد الخادم المحلي. يُتخطى تلقائياً إذا كان الخادم متوقفاً.
void main() {
  const base = 'http://localhost:4000/api';
  const otp = '123456';

  late ApiClient api;
  late AuthRepository auth;
  late ProductRepository products;
  late GovernorateRepository governorates;
  late CartRepository cart;
  late FavoritesRepository favorites;
  late OrderRepository orders;

  final phone =
      '077${(DateTime.now().millisecondsSinceEpoch % 100000000).toString().padLeft(8, '0')}';
  const password = 'Test@12345';

  setUpAll(() async {
    final up = await _backendUp();
    if (!up) {
      markTestSkipped(
        'خادم التطوير متوقف — شغّله عبر npm run dev ثم أعد التشغيل',
      );
      return;
    }
    api = ApiClient(dio: Dio(BaseOptions(baseUrl: base)));
    auth = AuthRepositoryImpl(api: api);
    products = ProductRepositoryImpl(api: api);
    governorates = GovernorateRepositoryImpl(api: api);
    cart = CartRepositoryImpl(api: api);
    favorites = FavoritesRepositoryImpl(api: api);
    orders = OrderRepositoryImpl(api: api);

    try {
      await auth.register(
        username: 'فحص تكاملي',
        phone: phone,
        password: password,
      );
      await auth.verifyOtp(phone, otp);
      final session = await auth.login(phone, password);
      api.tokenProvider = () => session.token;
    } catch (e) {
      if (e is AppException && e.message.contains('طلبات كثيرة')) {
        markTestSkipped(
          'تجاوز حد طلبات التحقق في الخادم — أعد تشغيله أو انتظر 15 دقيقة',
        );
        return;
      }
      rethrow;
    }
  });

  test('التسجيل/التفعيل/الدخول ثم جلب الملف الشخصي', () async {
    final me = await auth.me();
    expect(me.phone, phone);
  });

  test('الرئيسية والتصنيفات والمحافظات والبحث وتفاصيل المنتج', () async {
    final home = await products.fetchHome();
    expect(home.banners, isNotNull);

    final categories = await products.fetchCategories();
    expect(categories, isNotEmpty);
    expect(
      categories.where((c) => c.subcategories.isNotEmpty),
      isNotEmpty,
      reason: 'التصنيفات يجب أن تعرض مجموعاتها الفرعية',
    );

    final govs = await governorates.fetchGovernorates();
    expect(govs, isNotEmpty);
    expect(govs.first.id, isNotEmpty);
    expect(govs.first.name, isNotEmpty);

    final someProducts = await products.fetchProducts(page: 1, limit: 1);
    expect(someProducts.items, isNotEmpty);
    final sample = someProducts.items.first.name.trim();
    final term = sample.length >= 3 ? sample.substring(0, 3) : sample;
    final search = await products.searchProducts(term, limit: 5);
    expect(
      search.items,
      isNotEmpty,
      reason: 'البحث بالاسم يجب أن يعيد المنتج المطابق',
    );

    final details = await products.fetchProductDetails(
      someProducts.items.first.id,
    );
    expect(details.id, someProducts.items.first.id);
  });

  test('التصفّح بترقيم الصفحات', () async {
    final page1 = await products.fetchProducts(page: 1, limit: 2);
    expect(page1.items, isNotEmpty);
    expect(page1.page, 1);
    if (page1.hasMore) {
      final page2 = await products.fetchProducts(page: 2, limit: 2);
      expect(page2.items, isNotEmpty);
      expect(page2.page, 2);
      expect(page2.items.first.id, isNot(page1.items.map((p) => p.id).toSet()));
    }
  });

  test(
    'أقسام الإكسسوارات والحقائب: تحميل منتجاتها ومجموعاتها الفرعية',
    () async {
      final categories = await products.fetchCategories();

      for (final target in ['إكسسوارات', 'حقائب']) {
        final match = categories.where((c) => c.name.trim() == target).toList();
        expect(
          match,
          isNotEmpty,
          reason: 'القسم "$target" يجب أن يكون موجوداً في الخادم',
        );

        final category = match.first;
        expect(
          category.subcategories,
          isNotEmpty,
          reason: 'القسم "$target" يجب أن يعرض مجموعاته الفرعية',
        );

        final items = await products.fetchCategoryProducts(category.id);
        expect(
          items,
          isNotEmpty,
          reason: 'القسم "$target" يجب أن يحتوي منتجات',
        );

        // الفلترة تتم عبر subcategoryId الذي يصدّره الخادم مع المنتجات،
        // مع رجوع لاسم القسم الفرعي عند غياب المعرّف (توافق قديم).
        for (final sub in category.subcategories) {
          final subId = category.subcategoryIds[sub];
          final subItems = subId != null
              ? items.where((p) => p.subcategoryId == subId).toList()
              : items.where((p) => p.subcategory == sub).toList();
          expect(
            subItems,
            isNotEmpty,
            reason:
                'المجموعة الفرعية "$sub" في القسم "$target" يجب أن تحتوي منتجات',
          );
        }
      }
    },
  );

  test('المفضلة: إضافة ثم إزالة', () async {
    final page = await products.fetchProducts(page: 1, limit: 1);
    final id = page.items.first.id;
    await favorites.addFavorite(id);
    var list = await favorites.fetchFavorites();
    expect(list.map((p) => p.id), contains(id));
    await favorites.removeFavorite(id);
    list = await favorites.fetchFavorites();
    expect(list.map((p) => p.id), isNot(contains(id)));
  });

  test('العربة: إضافة/تحديث/إزالة', () async {
    final product = await _pickInStockProduct(products);

    var items = await cart.addToCart(product.id, quantity: 1);
    expect(items, isNotEmpty);
    expect(items.first.lineId, isNotNull);

    items = await cart.updateQuantity(items.first.lineId!, 2);
    expect(items.first.quantity, 2);

    items = await cart.removeFromCart(items.first.lineId!);
    expect(items, isEmpty);
  });

  test('واجهة السلة: إضافة تظهر فوراً → زيادة → نقصان → حذف', () async {
    final product = await _pickInStockProduct(products);

    final cubit = CartCubit(repository: CartRepositoryImpl(api: api));
    try {
      await cubit.add(product);
      var state = cubit.state;
      expect(state, isA<CartLoaded>());
      expect(
        state.items.map((i) => i.product.id),
        contains(product.id),
        reason: 'العنصر المضاف يجب أن يظهر فوراً في حالة السلة',
      );
      expect(state.count, 1);

      await cubit.increase(product.id);
      state = cubit.state;
      expect(
        state.items.first.quantity,
        2,
        reason: 'زيادة الكمية يجب أن تنعكس على الحالة',
      );
      expect(state.count, 2);

      await cubit.decrease(product.id);
      state = cubit.state;
      expect(
        state.items.first.quantity,
        1,
        reason: 'إنقاص الكمية يجب أن يعيدها إلى 1',
      );

      await cubit.remove(product.id);
      expect(cubit.state, isA<CartEmpty>(), reason: 'الحذف يجب أن يفرغ السلة');
    } finally {
      // عودة للوضع النظيف
      for (final item in cubit.state.items) {
        await cubit.remove(item.product.id);
      }
    }
  });

  test(
    'استعادة السلة بعد إعادة تشغيل (حالة جديدة + تحميل من الخادم)',
    () async {
      final product = await _pickInStockProduct(products);
      await cart.addToCart(product.id, quantity: 1);

      // محاكاة إعادة تشغيل التطبيق: مثيل جديد تماماً يقرأ من الخادم.
      final fresh = CartCubit(repository: CartRepositoryImpl(api: api));
      await fresh.load();
      expect(fresh.state, isA<CartLoaded>());
      expect(
        fresh.state.items,
        isNotEmpty,
        reason: 'السلة المحفوظة على الخادم يجب أن تستعاد بعد إعادة التشغيل',
      );

      for (final item in fresh.state.items) {
        await fresh.remove(item.product.id);
      }
    },
  );

  test('الطلب: إنشاء → قائمة → تفاصيل مع حالة "بانتظار التأكيد"', () async {
    final product = await _pickInStockProduct(products);
    await cart.addToCart(product.id, quantity: 1);
    final gov = (await governorates.fetchGovernorates()).first;

    final data = OrderData(
      governorateId: gov.id,
      province: gov.name,
      deliveryCost: gov.deliveryFee,
      fullAddress: 'شارع الاختبار — مجرة 7',
      phone: '07700000000',
      items: const [],
    );
    final created = await orders.placeOrder(data);
    expect(created.id, isNotEmpty);
    expect(created.number, isNotEmpty);

    final list = await orders.fetchMyOrders();
    expect(list.map((o) => o.id), contains(created.id));

    final details = await orders.fetchOrderDetails(created.id);
    expect(details.id, created.id);
    expect(details.productsTotal, greaterThan(0));
    expect(details.deliveryCost, greaterThan(0));
    expect(
      details.status,
      anyOf(OrderStatus.waitingAdmin, OrderStatus.pending),
      reason: 'الطلب الجديد يجب أن يظهر بانتظار تأكيد الإدارة',
    );
  });

  test(
    'دخول المدير المعتمد (seed) عبر طبقة التطبيق وجلب الملف الإداري',
    () async {
      // بيانات المدير المعرّفة في backend/scripts/seed.ts (بيئة تطوير محلية).
      const adminPhone = '07700000000';
      const adminPassword = 'admin123';

      final adminApi = ApiClient(dio: Dio(BaseOptions(baseUrl: base)));
      final adminAuth = AuthRepositoryImpl(api: adminApi);

      final session = await adminAuth.login(adminPhone, adminPassword);
      expect(session.token, isNotEmpty);

      adminApi.tokenProvider = () => session.token;
      final me = await adminAuth.me();
      expect(me.role, 'admin');
      expect(me.phone, adminPhone);
    },
  );
}

Future<bool> _backendUp() async {
  try {
    final client = Dio(
      BaseOptions(
        baseUrl: 'http://localhost:4000',
        connectTimeout: const Duration(seconds: 2),
        receiveTimeout: const Duration(seconds: 2),
      ),
    );
    final res = await client.get<dynamic>('/health');
    return res.statusCode == 200;
  } catch (_) {
    return false;
  }
}

/// يعيد أول منتج متوفر في المخزون (تتجنب عروض المخزون الصفري التي ترفضها السلة).
Future<Product> _pickInStockProduct(ProductRepository repo) async {
  for (var page = 1; page <= 5; page++) {
    final result = await repo.fetchProducts(page: page, limit: 50);
    for (final product in result.items) {
      if (product.stock > 0) return product;
    }
    if (!result.hasMore) break;
  }
  throw StateError('لا يوجد منتج متوفر في المخزون');
}
