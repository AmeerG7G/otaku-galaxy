// الرئيسية بعد انقطاع الشبكة ثم «إعادة المحاولة» — لا بيانات قديمة ولا مخترعة.
//
// [CRITICAL REGRESSION GUARD] العطب المُبلَّغ عنه: شبكة تنقطع، فشل، ضغط
// «إعادة المحاولة» — فتظهر مؤقّتاً بيانات قديمة وصور منتجات قديمة ورسمُ
// الشخصية الافتراضي، ثم «يتصحّح» كل شيء لاحقاً. ليست ذاكرة الصور. الجذور:
//
// ١) الرئيسية كانت تعرض الفشل على أنه نجاحٌ فارغ: `snapshot.data ?? HomeData()`
//    — فيُرسم البطل المضمَّن (رسم الشخصية + «موسم جديد») بدل بنر المسؤول، بلا
//    حالة خطأ ولا زرّ إعادة محاولة.
// ٢) تغذية «اكتشف» (`_explore`/`_explorePage`) تعيش خارج الطلب الذي يملكها:
//    لا تُصفَّر عند إعادة الجلب، و«تحميل المزيد» الجاري من جيلٍ سابق يُلحَق
//    بعد وصول الجديد — نماذج منتجات قديمة (صورها وأسعارها وأسماؤها) بجانب
//    الجديدة، أو وحدها بعد فشل.
// ٣) «إعادة المحاولة» في حاجز الاتصال تعيد فحص الاتصال فقط: ما صنعته الشاشة
//    أثناء الانقطاع يُكشف كما هو ولا يُعاد جلب شيء.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/errors/app_exception.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/connectivity/presentation/offline_gate.dart';
import 'package:otaku_galaxy/features/favorites/presentation/cubit/favorites_cubit.dart';
import 'package:otaku_galaxy/features/home/presentation/screens/home_screen.dart';
import 'package:otaku_galaxy/features/home/presentation/widgets/home_compositions.dart';
import 'package:otaku_galaxy/features/home/presentation/widgets/product_card.dart';
import 'package:otaku_galaxy/features/notifications/domain/entities/app_notification.dart';
import 'package:otaku_galaxy/features/notifications/domain/repositories/notification_repository.dart';
import 'package:otaku_galaxy/features/notifications/presentation/cubit/notifications_cubit.dart';
import 'package:otaku_galaxy/features/products/domain/entities/banner.dart' as model;
import 'package:otaku_galaxy/features/products/domain/entities/category.dart';
import 'package:otaku_galaxy/features/products/domain/entities/home_data.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product_page.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product_sort.dart';
import 'package:otaku_galaxy/features/products/domain/repositories/product_repository.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_home_usecase.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_products_usecase.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/auth_stub.dart';
import 'support/render_harness.dart';

/// مستودعٌ يتحكّم الاختبار في لحظة اكتمال كل طلب — ونتيجته.
class _Repo implements ProductRepository {
  final List<Completer<HomeData>> homeRequests = [];
  final List<Completer<ProductPage>> productRequests = [];
  final List<int> productPages = [];

  @override
  Future<HomeData> fetchHome() {
    final completer = Completer<HomeData>();
    homeRequests.add(completer);
    return completer.future;
  }

  @override
  Future<ProductPage> fetchProducts({
    int page = 1,
    int limit = 20,
    String? categoryId,
    String? subcategoryId,
  }) {
    final completer = Completer<ProductPage>();
    productRequests.add(completer);
    productPages.add(page);
    return completer.future;
  }

  @override
  Future<List<Category>> fetchCategories() async => const [];
  @override
  Future<List<Product>> fetchCategoryProducts(String categoryId, {ProductSort? sort}) async => const [];
  @override
  Future<ProductPage> searchProducts(String query, {int page = 1, int limit = 20}) async =>
      const ProductPage(items: [], hasMore: false);
  @override
  Future<Product> fetchProductDetails(String id) async => throw UnimplementedError();
}

class _NoNotifications implements NotificationRepository {
  @override
  Future<List<AppNotification>> fetchAll() async => const [];
  @override
  Future<void> markAllRead() async {}
  @override
  Future<void> markRead(String id) async {}
}

/// الفشل كما يرميه `ApiClient` حين لا شبكة.
const _offline = AppException('connection error', messageKey: 'errConnection');

/// منتجٌ باسمٍ واحد في اللغتين — فلا يتوقّف الحكم على لغة الواجهة.
Product _product(String id, String name) => Product(
  id: id,
  nameAr: name,
  nameCkb: name,
  price: 1000,
  images: ['https://cdn.test/$id.png'],
  stock: 5,
);

/// بنر البطل كما يصل من الخادم — العنوان نفسه في الحقول القديمة والجديدة.
model.Banner _hero(String id, String title) => model.Banner.fromJson({
  'id': id,
  'imageUrl': 'https://cdn.test/banner-$id.png',
  'title': title,
  'subtitle': '',
  'titleAr': title,
  'titleCkb': title,
  'placement': 'hero',
  'destinationType': 'none',
});

HomeData _home(String hero, {List<Product> discover = const []}) =>
    HomeData(heroBanner: _hero(hero, 'بطل $hero'), discover: discover);

final Finder _defaultHeroCopy = find.text(AppStrings.arabic('heroNewSeason'));

Finder get _retryButton => find.descendant(
  of: find.byType(AnimeErrorState),
  matching: find.byType(AnimePrimaryButton),
);

/// روابط صور الشبكة المرسومة الآن.
Set<String> _networkUrls(WidgetTester tester) => tester
    .widgetList<Image>(find.byType(Image))
    .map((i) => i.image)
    .whereType<NetworkImage>()
    .map((n) => n.url)
    .toSet();

class _Harness {
  _Harness(this.repo, this.locale);
  final _Repo repo;
  final LocaleCubit locale;
}

Future<_Harness> _pump(WidgetTester tester, {bool gate = false}) async {
  tester.view.physicalSize = const Size(412, 892);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  SharedPreferences.setMockInitialValues({});
  final locale = LocaleCubit(await SharedPreferences.getInstance());
  addTearDown(locale.close);
  final repo = _Repo();
  await tester.pumpWidget(
    MultiRepositoryProvider(
      providers: [
        RepositoryProvider.value(value: FetchHomeUsecase(repo)),
        RepositoryProvider.value(value: FetchProductsUsecase(repo)),
      ],
      child: MultiBlocProvider(
        providers: [
          BlocProvider<LocaleCubit>.value(value: locale),
          BlocProvider<AuthCubit>(create: (_) => stubAuthCubit(gender: 'male')),
          BlocProvider<FavoritesCubit>(create: (_) => FavoritesCubit()),
          BlocProvider<NotificationsCubit>(create: (_) => NotificationsCubit(_NoNotifications())),
        ],
        child: MaterialApp(
          theme: AppTheme.light,
          locale: const Locale('ar'),
          supportedLocales: const [Locale('ar')],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          // كما في `app.dart`: الحاجز فوق الموجّه، والشاشات تحته مركّبة دائماً.
          builder: gate ? (context, child) => OfflineGate(child: child!) : null,
          home: const Scaffold(body: HomeScreen()),
        ),
      ),
    ),
  );
  await tester.pump();
  return _Harness(repo, locale);
}

/// إطاراتٌ محدودة لا `pumpAndSettle`: هيكل التحميل ومؤشّر «تحميل المزيد»
/// ونبض الحاجز حركاتٌ لا تنتهي، فالانتظار حتى السكون لا ينتهي أبداً.
Future<void> _frames(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
}

/// يُكمل طلب الرئيسية رقم [index] بالبيانات.
Future<void> _completeHome(WidgetTester tester, _Repo repo, int index, HomeData data) async {
  repo.homeRequests[index].complete(data);
  await _frames(tester);
}

Future<void> _failHome(WidgetTester tester, _Repo repo, int index) async {
  repo.homeRequests[index].completeError(_offline);
  await _frames(tester);
}

/// سحبٌ قصير يطلق «تحميل المزيد» (المدى أقصر من عتبة الـ600).
Future<void> _scrollExplore(WidgetTester tester) async {
  await tester.drag(find.byType(CustomScrollView), const Offset(0, -120));
  await _frames(tester);
}

/// سحبٌ للتحديث كما يفعله المستخدم: عودة إلى القمّة، ثم سحبٌ منها.
Future<void> _pullToRefresh(WidgetTester tester) async {
  final scrollable = find.descendant(
    of: find.byType(CustomScrollView),
    matching: find.byType(Scrollable),
  );
  final position = tester.state<ScrollableState>(scrollable.first).position;
  if (position.pixels > 0) {
    position.jumpTo(0);
    await _frames(tester);
  }
  await tester.fling(find.byType(CustomScrollView), const Offset(0, 500), 1000);
  await tester.pump();
  await tester.pump(const Duration(seconds: 1));
  await tester.pump(const Duration(seconds: 1));
}

/// عدد بطاقات شبكة «اكتشف» كما يعلنه مندوبها — لا ما بُني منها في النافذة.
int _exploreCount(WidgetTester tester) =>
    (tester.widget<SliverGrid>(find.byType(SliverGrid)).delegate as SliverChildBuilderDelegate).childCount!;

/// ستّ بطاقات — مدى تمريرٍ حقيقي لإطلاق «تحميل المزيد».
List<Product> _six(String prefix) => [for (var i = 1; i <= 6; i++) _product('$prefix$i', 'اكتشاف $prefix$i')];

/// حالة تحميل حقيقية: الهيكل وحده — لا بطل ولا منتجات ولا خطأ.
void _expectLoadingOnly() {
  expect(find.byType(OtakuSkeleton), findsWidgets, reason: 'هيكل التحميل');
  expect(find.byType(HomeHeroCard), findsNothing, reason: 'لا بطل أثناء التحميل');
  expect(find.byType(ProductCard), findsNothing, reason: 'لا منتجات أثناء التحميل');
  expect(find.byType(AnimeErrorState), findsNothing, reason: 'لا خطأ قديم أثناء التحميل');
}

/// حالة خطأ حقيقية: لا بطل افتراضي ولا منتجات — ولا شيء يبدو «بيانات».
void _expectErrorOnly() {
  expect(find.byType(AnimeErrorState), findsOneWidget, reason: 'حالة خطأ ظاهرة');
  expect(_retryButton, findsOneWidget, reason: 'زرّ إعادة المحاولة');
  expect(find.byType(HomeHeroCard), findsNothing, reason: 'البطل المضمَّن ليس بيانات');
  expect(_defaultHeroCopy, findsNothing, reason: 'نصّ البطل الافتراضي ليس بيانات');
  expect(find.byType(ProductCard), findsNothing, reason: 'لا منتجات بعد فشل');
}

void main() {
  setUpAll(loadProjectFonts);

  testWidgets('تحميل ناجح: بطل المسؤول وصورته ومنتجاته', (tester) async {
    final h = await _pump(tester);
    _expectLoadingOnly();
    await _completeHome(tester, h.repo, 0, _home('a', discover: [_product('p1', 'منتج أ')]));

    expect(find.text('بطل a'), findsOneWidget);
    expect(find.text('منتج أ'), findsOneWidget);
    expect(_defaultHeroCopy, findsNothing);
    expect(_networkUrls(tester), containsAll(['https://cdn.test/banner-a.png', 'https://cdn.test/p1.png']));
    expect(tester.takeException(), isNull);
  });

  group('[CRITICAL] الفشل حالةُ خطأ لا «بيانات فارغة»', () {
    testWidgets('فشل الجلب → خطأ + إعادة محاولة، بلا البطل المضمَّن ولا رسمه', (tester) async {
      final h = await _pump(tester);
      await _failHome(tester, h.repo, 0);
      _expectErrorOnly();
      expect(tester.takeException(), isNull);
    });

    testWidgets('إعادة المحاولة: طلبٌ جديد، وتحميلٌ نظيف، ثم البيانات الجديدة', (tester) async {
      final h = await _pump(tester);
      await _failHome(tester, h.repo, 0);

      await tester.tap(_retryButton);
      await tester.pump();
      expect(h.repo.homeRequests, hasLength(2), reason: 'إعادة المحاولة تبدأ طلباً جديداً');
      _expectLoadingOnly();

      await _completeHome(tester, h.repo, 1, _home('b', discover: [_product('p2', 'منتج ب')]));
      expect(find.text('بطل b'), findsOneWidget);
      expect(find.text('منتج ب'), findsOneWidget);
      expect(find.byType(AnimeErrorState), findsNothing);
    });

    testWidgets('إعادة محاولة فاشلة: خطأ من جديد — لا بيانات سابقة ولا افتراضية', (tester) async {
      final h = await _pump(tester);
      await _completeHome(tester, h.repo, 0, _home('a', discover: [_product('p1', 'منتج أ')]));
      // سحبٌ للتحديث يفشل — الشبكة انقطعت — ثم إعادة محاولة تفشل أيضاً.
      await _pullToRefresh(tester);
      expect(h.repo.homeRequests, hasLength(2));
      await _failHome(tester, h.repo, 1);
      _expectErrorOnly();
      expect(find.text('منتج أ'), findsNothing, reason: 'منتجات الجيل السابق لا تبقى');

      await tester.tap(_retryButton);
      await tester.pump();
      _expectLoadingOnly();
      await _failHome(tester, h.repo, 2);
      _expectErrorOnly();
      expect(find.text('بطل a'), findsNothing);
      expect(find.text('منتج أ'), findsNothing);
    });

    testWidgets('إعادة محاولة متكرّرة سريعة: الردّ الأحدث وحده يُعرض، والأقدم المتأخّر يُهمَل', (
      tester,
    ) async {
      final h = await _pump(tester);
      await _failHome(tester, h.repo, 0);

      // ضغطتان قبل أي إطار: طلبان متداخلان.
      await tester.tap(_retryButton);
      await tester.tap(_retryButton);
      await tester.pump();
      expect(h.repo.homeRequests, hasLength(3));

      // الأقدم يصل أولاً — لا يُعرض (الأحدث ما زال معلّقاً).
      h.repo.homeRequests[1].complete(_home('stale', discover: [_product('s', 'منتج متجاوَز')]));
      await tester.pump();
      _expectLoadingOnly();

      await _completeHome(tester, h.repo, 2, _home('b', discover: [_product('p2', 'منتج ب')]));
      expect(find.text('بطل b'), findsOneWidget);
      expect(find.text('بطل stale'), findsNothing);
      expect(find.text('منتج متجاوَز'), findsNothing);
    });

    testWidgets('طلبان متزامنان (تبديل لغة + إعادة محاولة) يكتملان بترتيبٍ معاكس — الأحدث يفوز', (
      tester,
    ) async {
      final h = await _pump(tester);
      await _failHome(tester, h.repo, 0);

      await tester.tap(_retryButton); // الطلب ١
      await tester.pump();
      await h.locale.setLanguage(AppLanguage.kurdish); // الطلب ٢
      await tester.pump();
      expect(h.repo.homeRequests, hasLength(3));

      await _completeHome(tester, h.repo, 2, _home('new', discover: [_product('n', 'منتج جديد')]));
      await _completeHome(tester, h.repo, 1, _home('old', discover: [_product('o', 'منتج قديم')]));
      expect(find.text('بطل new'), findsOneWidget);
      expect(find.text('منتج جديد'), findsOneWidget);
      expect(find.text('بطل old'), findsNothing, reason: 'الردّ المتجاوَز لا يطمس الأحدث');
      expect(find.text('منتج قديم'), findsNothing);
    });
  });

  group('[CRITICAL] تغذية «اكتشف» ملكُ الجيل الذي جلبها', () {
    testWidgets('«تحميل المزيد» من جيلٍ سابق يصل بعد إعادة الجلب فلا يُلحَق، والترقيم يبدأ من جديد', (
      tester,
    ) async {
      final h = await _pump(tester);
      await _completeHome(tester, h.repo, 0, _home('a', discover: _six('a')));

      await _scrollExplore(tester);
      expect(h.repo.productPages.first, 1, reason: 'تحميل المزيد انطلق');
      final stale = h.repo.productRequests.first;

      // إعادة جلب (سحبٌ للتحديث) بينما «تحميل المزيد» معلّق.
      final before = h.repo.homeRequests.length;
      await _pullToRefresh(tester);
      expect(h.repo.homeRequests, hasLength(before + 1));
      await _completeHome(tester, h.repo, before, _home('b', discover: _six('b')));

      // ردّ الجيل السابق يصل الآن متأخّراً.
      stale.complete(ProductPage(items: [_product('x', 'منتج قديم متأخّر')], hasMore: true));
      await _frames(tester);
      expect(find.text('اكتشاف b1'), findsOneWidget);
      expect(_exploreCount(tester), 6, reason: 'ردٌّ متجاوَز لا يُلحَق بالشبكة');
      expect(find.text('منتج قديم متأخّر'), findsNothing);
      expect(find.text('اكتشاف a1'), findsNothing);

      // الترقيم يخصّ الجيل الجديد: أول «تحميل مزيد» بعده هو الصفحة ١.
      final sent = h.repo.productPages.length;
      await _scrollExplore(tester);
      expect(h.repo.productPages.length, greaterThan(sent), reason: 'تحميل المزيد انطلق بعد التحديث');
      expect(h.repo.productPages[sent], 1, reason: 'الترقيم لا يرث صفحات الجيل السابق');
    });

    testWidgets('منتجات صفحةٍ محمَّلة سابقاً لا تبقى بعد إعادة الجلب', (tester) async {
      final h = await _pump(tester);
      await _completeHome(tester, h.repo, 0, _home('a', discover: _six('a')));
      await _scrollExplore(tester);
      h.repo.productRequests.first.complete(
        ProductPage(items: [_product('x1', 'صفحة أ')], hasMore: false),
      );
      await _frames(tester);
      expect(_exploreCount(tester), 7, reason: 'الصفحة أُلحقت بالجيل الحالي');

      final before = h.repo.homeRequests.length;
      await _pullToRefresh(tester);
      await _completeHome(tester, h.repo, before, _home('b', discover: _six('b')));
      expect(find.text('اكتشاف b1'), findsOneWidget);
      expect(_exploreCount(tester), 6, reason: 'نماذج منتجات الجيل السابق لا تبقى');
      expect(find.text('صفحة أ'), findsNothing);
      expect(find.text('اكتشاف a1'), findsNothing);
    });

    testWidgets('تبدّل روابط الصور بين ردّين: كل بطاقة بصورة منتجها، والبطل بصورة الجيل الجديد', (
      tester,
    ) async {
      final h = await _pump(tester);
      await _completeHome(tester, h.repo, 0, _home('a', discover: [_product('a1', 'أ١'), _product('a2', 'أ٢')]));
      expect(_networkUrls(tester), containsAll(['https://cdn.test/banner-a.png', 'https://cdn.test/a1.png']));

      await _pullToRefresh(tester);
      await _completeHome(tester, h.repo, 1, _home('b', discover: [_product('b1', 'ب١'), _product('b2', 'ب٢')]));
      final urls = _networkUrls(tester);
      expect(urls, containsAll(['https://cdn.test/banner-b.png', 'https://cdn.test/b1.png', 'https://cdn.test/b2.png']));
      for (final stale in ['https://cdn.test/banner-a.png', 'https://cdn.test/a1.png', 'https://cdn.test/a2.png']) {
        expect(urls, isNot(contains(stale)), reason: 'صورة الجيل السابق: $stale');
      }
      // كل بطاقة تعرض صورة منتجها هي.
      for (final card in tester.widgetList<ProductCard>(find.byType(ProductCard))) {
        final image = tester.widget<Image>(
          find.descendant(
            of: find.byWidget(card),
            matching: find.byWidgetPredicate((w) => w is Image && w.image is NetworkImage),
          ),
        );
        expect((image.image as NetworkImage).url, card.product.images.first);
      }
    });
  });

  group('[CRITICAL] حاجز الاتصال: عودة الاتصال تعيد جلب الرئيسية', () {
    const method = MethodChannel('dev.fluttercommunity.plus/connectivity');
    const events = EventChannel('dev.fluttercommunity.plus/connectivity_status');
    late List<String> current;
    MockStreamHandlerEventSink? sink;

    /// قناتا `connectivity_plus` مزيَّفتان.
    ///
    /// [CRITICAL] داخل جسم الاختبار لا في `setUp`: معالج البثّ يُنشئ متحكّمه
    /// في المنطقة التي يُستدعى فيها، و`setUp` خارج منطقة الزمن المزيَّف —
    /// فتنتظر أحداثه حلقةَ أحداثٍ حقيقية لا يديرها `pump` أبداً.
    void mockConnectivity(List<String> initial) {
      current = initial;
      sink = null;
      final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
      messenger.setMockMethodCallHandler(method, (call) async => call.method == 'check' ? current : null);
      messenger.setMockStreamHandler(
        events,
        MockStreamHandler.inline(
          onListen: (_, events) {
            sink = events;
          },
          onCancel: (_) {
            sink = null;
          },
        ),
      );
      addTearDown(() {
        messenger.setMockMethodCallHandler(method, null);
        messenger.setMockStreamHandler(events, null);
      });
    }

    /// حدث اتصالٍ من «النظام». الحدث المزيَّف يعبر حلقة أحداثٍ حقيقية قبل أن
    /// يصل إلى القناة، فيُعطى دورةً حقيقية واحدة ثم إطاراً.
    Future<void> emit(WidgetTester tester, List<String> results) async {
      sink!.success(results);
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
      await tester.pump();
    }

    Finder gateRetry() => find.descendant(
      of: find.byType(OfflineGateScreen),
      matching: find.byType(AnimePrimaryButton),
    );

    testWidgets('فشلٌ خلف الحاجز ثم «إعادة المحاولة» بعد عودة الاتصال → جلبٌ جديد، لا بطل افتراضي', (
      tester,
    ) async {
      mockConnectivity(['none']);
      final h = await _pump(tester, gate: true);
      await tester.pump();
      expect(find.byType(OfflineGateScreen), findsOneWidget, reason: 'بدأ التطبيق بلا شبكة');
      await _failHome(tester, h.repo, 0);

      // إعادة المحاولة والشبكة ما تزال مقطوعة: الحاجز باقٍ ولا طلب.
      await tester.tap(gateRetry());
      await tester.pump();
      expect(find.byType(OfflineGateScreen), findsOneWidget);
      expect(h.repo.homeRequests, hasLength(1));

      // الشبكة تعود، والمستخدم يضغط «إعادة المحاولة» (عدّة مرات بسرعة).
      current = ['wifi'];
      await tester.tap(gateRetry());
      await tester.tap(gateRetry());
      await tester.pump();
      await tester.pump();
      // وحدثُ النظام بالعودة نفسها يصل بعد الضغط — العودة واحدة.
      await emit(tester, ['wifi']);
      expect(find.byType(OfflineGateScreen), findsNothing);
      expect(h.repo.homeRequests, hasLength(2), reason: 'عودة الاتصال تبدأ طلباً واحداً جديداً');
      _expectLoadingOnly();
      expect(_defaultHeroCopy, findsNothing);

      await _completeHome(tester, h.repo, 1, _home('live', discover: [_product('l', 'منتج حالي')]));
      expect(find.text('بطل live'), findsOneWidget);
      expect(find.text('منتج حالي'), findsOneWidget);
    });

    testWidgets('عودة الاتصال تلقائياً (بلا ضغط) تعيد جلب الرئيسية المحمَّلة قبل الانقطاع', (tester) async {
      mockConnectivity(['wifi']);
      final h = await _pump(tester, gate: true);
      await tester.pump();
      await _completeHome(tester, h.repo, 0, _home('before', discover: [_product('b', 'قبل الانقطاع')]));
      expect(find.byType(OfflineGateScreen), findsNothing);

      await emit(tester, ['none']);
      expect(find.byType(OfflineGateScreen), findsOneWidget);
      expect(h.repo.homeRequests, hasLength(1), reason: 'الانقطاع وحده لا يطلب شيئاً');

      await emit(tester, ['wifi']);
      expect(find.byType(OfflineGateScreen), findsNothing);
      expect(h.repo.homeRequests, hasLength(2), reason: 'عودة الاتصال تعيد الجلب');
      _expectLoadingOnly();
      await _completeHome(tester, h.repo, 1, _home('after', discover: [_product('a', 'بعد العودة')]));
      expect(find.text('بطل after'), findsOneWidget);
      expect(find.text('قبل الانقطاع'), findsNothing);
    });
  });
}
