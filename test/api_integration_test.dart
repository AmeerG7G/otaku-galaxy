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

    final cubit = CartCubit(CartRepositoryImpl(api: api));
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
      final fresh = CartCubit(CartRepositoryImpl(api: api));
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

  /// [B-1/B-2] بيانات العرض يجب أن تكون واحدة عبر كل سطح — عبر الخادم
  /// الحقيقي وطبقة بيانات التطبيق الحقيقية، لا حمولات مُصطنعة.
  ///
  /// كان المنتج الواحد يصل مخفَّضاً إلى الرئيسية والبحث، وبلا أي بيانات عرض
  /// إلى المفضلة، وبلا `deliveryPromoAmount` إلى التفاصيل و«اكتشف».
  test('العرض نفسه يصل متطابقاً إلى التفاصيل والمفضلة والرئيسية', () async {
    // منتج مخفَّض فعلاً من الكتالوج — إن لم يوجد، لا شيء يُفحص.
    Product? discounted;
    for (var page = 1; page <= 5 && discounted == null; page++) {
      final result = await products.fetchProducts(page: page, limit: 50);
      for (final p in result.items) {
        if (p.hasDiscount && p.hasDeliveryPromo && p.deliveryPromoAmount > 0) {
          discounted = p;
          break;
        }
      }
      if (!result.hasMore) break;
    }
    if (discounted == null) {
      markTestSkipped('لا يوجد منتج بعرض كامل في قاعدة التطوير');
      return;
    }

    final fromList = discounted;

    // 1) التفاصيل — كانت تصل بلا deliveryPromoAmount.
    final detail = await products.fetchProductDetails(fromList.id);
    expect(detail.previousPrice, fromList.previousPrice);
    expect(detail.discountPercent, fromList.discountPercent);
    expect(detail.hasDeliveryPromo, fromList.hasDeliveryPromo);
    expect(
      detail.deliveryPromoAmount,
      fromList.deliveryPromoAmount,
      reason: 'تفاصيل المنتج يجب أن تحمل نفس قيمة خصم التوصيل',
    );

    // 2) المفضلة — كانت تصل بلا أي بيانات عرض إطلاقاً.
    await favorites.addFavorite(fromList.id);
    final favs = await favorites.fetchFavorites();
    final fromFav = favs.firstWhere((p) => p.id == fromList.id);
    expect(fromFav.previousPrice, fromList.previousPrice);
    expect(fromFav.discountPercent, fromList.discountPercent);
    expect(fromFav.hasDiscount, isTrue);
    expect(fromFav.hasDeliveryPromo, fromList.hasDeliveryPromo);
    expect(
      fromFav.deliveryPromoAmount,
      fromList.deliveryPromoAmount,
      reason: 'المفضلة يجب أن تعرض نفس الخصم الذي تعرضه بقية الشاشات',
    );
    await favorites.removeFavorite(fromList.id);

    // 3) «اكتشف» — العقد كامل لكل منتجاته، أياً كانت القائمة العشوائية.
    final home = await products.fetchHome();
    expect(home.discover, isNotEmpty);
    for (final p in home.discover) {
      if (p.hasDeliveryPromo) {
        expect(
          p.deliveryPromoAmount,
          greaterThan(0),
          reason: 'شارة ترويج التوصيل بلا مبلغ = سطر مخفيّ في البطاقة',
        );
      }
      if (p.previousPrice != null) {
        expect(p.discountPercent, isNotNull);
      }
    }
  });

  /// [MEDIA] كل مرجع وسائط يصل من الخادم يجب أن يكون قابلاً للتحميل فعلاً
  /// بعد تمريره على `resolveMediaUrl` — لا تحقّق شكليّ فقط.
  ///
  /// هذا يغلق السلسلة كاملة داخل طبقة التطبيق الحقيقية:
  /// الخادم → النموذج → المحوِّل → طلب HTTP فعلي → 200 بمحتوى صورة.
  test('كل صورة يعيدها الخادم تُحمَّل فعلاً بعد التحويل', () async {
    final home = await products.fetchHome();

    final refs = <String>{};
    for (final banner in home.banners) {
      final url = banner.imageUrl;
      if (url != null && url.isNotEmpty) refs.add(url);
    }
    for (final category in home.categories) {
      final url = category.imageUrl;
      if (url != null && url.isNotEmpty) refs.add(url);
    }
    for (final bucket in [home.offers, home.selectedProducts, home.discover]) {
      for (final product in bucket) {
        refs.addAll(product.images.where((i) => i.isNotEmpty));
      }
    }

    expect(refs, isNotEmpty, reason: 'لا صور في الرئيسية — لا شيء يُفحص');

    // الروابط الخارجية (بذور placehold.co) تُستثنى: الفحص لسلامة أنبوب
    // الوسائط لدينا، لا لتوفّر خدمة طرف ثالث أثناء الاختبار.
    final ours = refs.where((u) => u.contains('/uploads/')).toList();

    // عميل واحد بمهلة قصيرة — لا عميل جديد لكل صورة ولا انتظار مفتوح.
    final media = Dio(
      BaseOptions(
        connectTimeout: const Duration(seconds: 3),
        receiveTimeout: const Duration(seconds: 3),
        responseType: ResponseType.bytes,
        validateStatus: (_) => true,
      ),
    );

    final failures = <String>[];
    for (final url in ours) {
      // كل رابط هنا مطلق أصلاً — `resolveMediaUrl` طبّقه في النموذج.
      expect(
        url.startsWith('http'),
        isTrue,
        reason: 'المحوِّل لم يُنتج رابطاً مطلقاً: $url',
      );
      try {
        final res = await media.get<List<int>>(url);
        final type = res.headers.value('content-type') ?? '';
        if (res.statusCode != 200 || !type.startsWith('image/')) {
          failures.add('$url -> ${res.statusCode} $type');
        }
      } catch (e) {
        failures.add('$url -> $e');
      }
    }
    media.close(force: true);

    expect(failures, isEmpty, reason: failures.join(' | '));
  }, timeout: const Timeout(Duration(minutes: 2)));

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
