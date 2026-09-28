// المنطقة المحيطة بشريط التنقّل السفلي — بلا سطح فاتح خاصّ بها.
//
// [CRITICAL] السبب لم يكن في `OtakuBottomNav` نفسه. الغلاف الرئيسي يستعمل
// `Scaffold(extendBody: true)`، فيُبلغ Scaffold جسمَه أن الحشوة السفلية
// تساوي ارتفاع الشريط. أي شاشة تبويب تلفّ محتواها بـ`SafeArea` افتراضية
// (`bottom: true`) تستهلك تلك الحشوة، فيتوقّف محتواها فوق الشريط ويظهر
// تحته شريطٌ فارغ بلون الخلفية يحيط بالشريط العائم.
//
// أربعة تبويبات تمرّر `bottom: false` منذ البداية؛ الرئيسية وحدها كانت
// شاذّة — ولذلك «تطابق سلوك شاشة الأقسام» هو بالضبط وصف الإصلاح.

import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
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
import 'package:otaku_galaxy/features/categories/presentation/screens/categories_screen.dart';
import 'package:otaku_galaxy/features/home/presentation/screens/home_screen.dart';
import 'package:otaku_galaxy/features/notifications/domain/entities/app_notification.dart';
import 'package:otaku_galaxy/features/notifications/domain/repositories/notification_repository.dart';
import 'package:otaku_galaxy/features/notifications/presentation/cubit/notifications_cubit.dart';
import 'package:otaku_galaxy/features/products/domain/entities/category.dart';
import 'package:otaku_galaxy/features/products/domain/entities/home_data.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product_page.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product_sort.dart';
import 'package:otaku_galaxy/features/products/domain/repositories/product_repository.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_categories_usecase.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_home_usecase.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_products_usecase.dart';

import 'support/render_harness.dart';

const _user = User(
  id: 'u1',
  username: 'مدقق',
  phone: '+9647701234567',
  role: 'customer',
);

class _Repo implements ProductRepository {
  @override
  Future<HomeData> fetchHome() => Completer<HomeData>().future;
  @override
  Future<ProductPage> fetchProducts({
    int page = 1,
    int limit = 20,
    String? categoryId,
    String? subcategoryId,
  }) async => const ProductPage(items: [], hasMore: false);
  @override
  Future<List<Category>> fetchCategories() async => const [];
  @override
  Future<List<Product>> fetchCategoryProducts(
    String categoryId, {
    ProductSort? sort,
  }) async => const [];
  @override
  Future<ProductPage> searchProducts(
    String query, {
    int page = 1,
    int limit = 20,
    ProductSort? sort,
  }) async => const ProductPage(items: [], hasMore: false);
  @override
  Future<Product> fetchProductDetails(String id) async =>
      throw UnimplementedError();
}

class _NoNotifications implements NotificationRepository {
  @override
  Future<List<AppNotification>> fetchAll() async => const [];
  @override
  Future<void> markAllRead() async {}
  @override
  Future<void> markRead(String id) async {}
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

class _InMemoryAuthStorage implements AuthLocalStorage {
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

AuthCubit _authCubit() {
  final repo = _StubAuthRepository();
  return AuthCubit(
    localStorage: _InMemoryAuthStorage(),
    loginUsecase: LoginUsecase(repo),
    registerUsecase: RegisterUsecase(repo),
    forgotPasswordUsecase: ForgotPasswordUsecase(repo),
    getMeUsecase: GetMeUsecase(repo),
    updateProfileUsecase: UpdateProfileUsecase(repo),
    changePasswordUsecase: ChangePasswordUsecase(repo),
  );
}

final _key = GlobalKey();

/// ارتفاع تقريبي لشريط التنقّل — يُقاس فعلياً في الاختبار.
const _navItems = [
  OtakuNavItem(
    icon: Icons.home_outlined,
    activeIcon: Icons.home_rounded,
    label: 'الرئيسية',
  ),
  OtakuNavItem(
    icon: Icons.grid_view_outlined,
    activeIcon: Icons.grid_view_rounded,
    label: 'الأقسام',
    gridIconCount: 4,
  ),
  OtakuNavItem(
    icon: Icons.photo_library_outlined,
    activeIcon: Icons.photo_library_rounded,
    label: 'المجتمع',
  ),
  OtakuNavItem(
    icon: Icons.shopping_bag_outlined,
    activeIcon: Icons.shopping_bag_rounded,
    label: 'السلة',
  ),
  OtakuNavItem(
    icon: Icons.person_outline,
    activeIcon: Icons.person_rounded,
    label: 'الحساب',
  ),
];

/// يبني الغلاف كما في الإنتاج: `extendBody` + شريط سفلي + شاشة التبويب.
Future<void> _pumpShell(
  WidgetTester tester, {
  required Widget tab,
  required bool dark,
  Size size = const Size(412, 892),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final repo = _Repo();
  await tester.pumpWidget(
    MultiRepositoryProvider(
      providers: [
        RepositoryProvider.value(value: FetchHomeUsecase(repo)),
        RepositoryProvider.value(value: FetchProductsUsecase(repo)),
        RepositoryProvider.value(value: FetchCategoriesUsecase(repo)),
      ],
      child: MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: _authCubit()),
          BlocProvider<NotificationsCubit>.value(
            value: NotificationsCubit(_NoNotifications()),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.light,
          darkTheme: AppTheme.dark,
          themeMode: dark ? ThemeMode.dark : ThemeMode.light,
          locale: const Locale('ar'),
          supportedLocales: const [Locale('ar')],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: RepaintBoundary(
            key: _key,
            child: Scaffold(
              // نفس ما يفعله `MainNavigationScreen`.
              extendBody: true,
              body: tab,
              bottomNavigationBar: OtakuBottomNav(
                currentIndex: 0,
                raisedIndex: 2,
                onSelected: (_) {},
                items: _navItems,
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}

/// اللون بصيغة RGBA معبّأة — نفس ترتيب بايتات `Snapshot.at`.
int _packed(Color color) {
  int channel(double v) => (v * 255).round() & 0xff;
  return (channel(color.r) << 24) |
      (channel(color.g) << 16) |
      (channel(color.b) << 8) |
      channel(color.a);
}

void main() {
  setUpAll(loadProjectFonts);

  group('الشاشات لا تستهلك الحشوة السفلية', () {
    testWidgets('[CRITICAL] محتوى الرئيسية يمتدّ خلف الشريط', (tester) async {
      // القياس المباشر للعطب: الفرع الأخير من شجرة الرئيسية يجب أن يصل إلى
      // قاع الشاشة. إن توقّف فوقه بمقدار ارتفاع الشريط فقد استُهلكت الحشوة
      // وظهر الشريط الفارغ المحيط.
      await _pumpShell(tester, tab: const HomeScreen(), dark: false);

      final screenHeight = tester.view.physicalSize.height;
      // [CRITICAL] يُقاس عمود المحتوى **داخل** `SafeArea` لا عنصر الشاشة
      // نفسه: `extendBody` يعطي الجسمَ كامل الارتفاع دائماً، فمستطيل
      // `HomeScreen` يصل إلى القاع حتى مع العطب. ما تستهلكه `SafeArea` هو
      // ما يقع تحتها.
      final content = tester.getRect(
        find.descendant(of: find.byType(SafeArea), matching: find.byType(Column)).first,
      );
      expect(
        content.bottom,
        closeTo(screenHeight, 0.5),
        reason: 'محتوى الرئيسية يجب أن يصل إلى قاع الشاشة',
      );
    });

    testWidgets('الأقسام كذلك — السلوك المرجعي الذي تُطابقه الرئيسية', (
      tester,
    ) async {
      await _pumpShell(tester, tab: const CategoriesScreen(), dark: false);
      final screenHeight = tester.view.physicalSize.height;
      // الأقسام بلا `SafeArea` على مستوى الشاشة منذ 2026-09-28 (تمتدّ إلى
      // منطقة شريط الحالة بطلب المالك)، فالمقيس عمودُها الجذر: يصل إلى القاع
      // خلف الشريط ولا يستهلك الحشوة السفلية.
      final content = tester.getRect(
        find.descendant(of: find.byType(CategoriesScreen), matching: find.byType(Column)).first,
      );
      expect(content.bottom, closeTo(screenHeight, 0.5));
      expect(
        find.ancestor(of: find.byType(OtakuScreenHeader), matching: find.byType(SafeArea)),
        findsNothing,
      );
    });

    testWidgets('[CRITICAL] التبويبات الخمسة كلها تمرّر bottom: false', (
      tester,
    ) async {
      // حارسٌ نصّي يغطّي التبويبات التي يصعب بناؤها كاملةً هنا (المجتمع،
      // السلة، الحساب): أيّ تبويب يعود إلى `SafeArea` الافتراضية يعيد
      // الشريط الفارغ المحيط، ويسقط هنا قبل أن يُدمج.
      const tabs = {
        'home': 'lib/features/home/presentation/screens/home_screen.dart',
        'categories':
            'lib/features/categories/presentation/screens/categories_screen.dart',
        'community':
            'lib/features/community/presentation/screens/community_screen.dart',
        'cart': 'lib/features/cart/presentation/screens/cart_screen.dart',
        'account':
            'lib/features/account/presentation/screens/account_screen.dart',
      };
      for (final entry in tabs.entries) {
        final source = File(entry.value).readAsStringSync();
        final firstSafeArea = source.indexOf('SafeArea(');
        // الأقسام وحدها بلا `SafeArea` إطلاقاً (2026-09-28) — فلا تستهلك
        // الحشوة السفلية أصلاً. أيّ `SafeArea` يعود إليها يمرّ بالفحص نفسه.
        if (entry.key == 'categories' && firstSafeArea == -1) continue;
        expect(firstSafeArea, greaterThan(-1), reason: entry.key);
        final window = source.substring(
          firstSafeArea,
          firstSafeArea + 90 > source.length
              ? source.length
              : firstSafeArea + 90,
        );
        expect(
          window.contains('bottom: false'),
          isTrue,
          reason:
              'تبويب ${entry.key} يستهلك الحشوة السفلية، فيظهر سطح فارغ حول '
              'شريط التنقّل',
        );
      }
    });
  });

  group('المنطقة حول الشريط تكشف ما تحتها', () {
    for (final dark in [false, true]) {
      final mode = dark ? 'داكن' : 'فاتح';

      testWidgets('[CRITICAL] المحتوى يظهر خلف الشريط لا سطحٌ فارغ — $mode', (
        tester,
      ) async {
        await _pumpShell(tester, tab: const HomeScreen(), dark: dark);
        final shot = await snapshot(tester, _key);

        final theme = dark ? AppTheme.dark : AppTheme.light;
        final background = _packed(theme.scaffoldBackgroundColor);

        // الهامش الأيسر تحت الشريط العائم (x < 12، خارج حدوده): لو توقّف
        // محتوى الشاشة فوق الشريط لكان هذا الشريط كلّه لونَ الخلفية وحده —
        // وهو «السطح الفاتح المحيط» بعينه. ووصولُ المحتوى إليه يعني أن
        // الشاشة تمتدّ خلف الشريط كما في بقية التبويبات.
        final band = shot.distinctIn(
          0,
          shot.height - 70,
          12,
          shot.height - 4,
          step: 1,
        );

        expect(
          band.any((color) => color != background),
          isTrue,
          reason:
              'المنطقة حول الشريط كلّها لون الخلفية — أي أن محتوى الشاشة '
              'يتوقّف فوق الشريط ويظهر سطح فارغ يحيط به',
        );
      });
    }

    testWidgets('الشريط نفسه ما يزال سطحاً قائماً بوجهاته الخمس', (
      tester,
    ) async {
      // المطلوب إزالة السطح **المحيط** لا سطح الشريط نفسه.
      await _pumpShell(tester, tab: const HomeScreen(), dark: false);

      for (final label in [
        'الرئيسية',
        'الأقسام',
        'المجتمع',
        'السلة',
        'الحساب',
      ]) {
        expect(find.text(label), findsOneWidget, reason: label);
      }

      final shot = await snapshot(tester, _key);
      final page = shot.at(3, shot.height ~/ 2);
      // منتصف الشريط أفقياً وقرب قاعه: سطح الشريط، ويجب أن يختلف عن الخلفية.
      final bar = shot.at(shot.width ~/ 2, shot.height - 30);
      expect(bar, isNot(page), reason: 'سطح الشريط نفسه يبقى كما صمّم');
    });
  });
}
