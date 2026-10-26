// المستخدم المسجَّل يصل إلى السلة والحساب فعلاً — لا أن يُبلَّغ الضغط فحسب.
//
// [CRITICAL] لماذا لم يكشف `bottom_nav_navigation_test.dart` هذا العطب؟
// لأنه يبني `OtakuBottomNav` وحده ويثبت أن الضغط يصل `onSelected` بفهرسه.
// وهذا صحيح — لكن العطب كان في **جسم** `onSelected` داخل
// `MainNavigationScreen`، وهو جسمٌ لا ينفّذه ذلك الاختبار أبداً.
//
// وأخطر من ذلك: العطب كان يظهر **فقط حين يوجد `AuthCubit` في الشجرة**.
// `context.g` يقرأ الجنس بـ`watch<AuthCubit>()`، و`watch` خارج `build`
// يرمي. لكن `GenderedContext.gender` يلتقط `ProviderNotFoundException`
// وحدها — فاختبارٌ لا يزوّد `AuthCubit` يبتلع الاستثناء ويمرّ، بينما
// التطبيق الحقيقي (ومعه المكعّب دائماً) يرمي فيموت المعالِج قبل
// `setState`، فلا يتحرّك التبويب ولا تظهر رسالة.
//
// لذلك يبني هذا الملف الشاشة الحقيقية، بمستخدمٍ مسجَّل حقيقي، ويقيس
// **الوجهة المرئية النهائية** (`IndexedStack.index`) لا استدعاء ردّ النداء.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get_it/get_it.dart';

import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/cart/domain/entities/cart_item.dart';
import 'package:otaku_galaxy/features/cart/domain/repositories/cart_repository.dart';
import 'package:otaku_galaxy/features/cart/presentation/cubit/cart_cubit.dart';
import 'package:otaku_galaxy/features/main_navigation/presentation/screens/main_navigation_screen.dart';
import 'package:otaku_galaxy/features/collections/presentation/cubit/collections_cubit.dart';
import 'package:otaku_galaxy/features/notifications/presentation/cubit/notifications_cubit.dart';
import 'package:otaku_galaxy/features/collections/domain/repositories/collection_repository.dart';
import 'package:otaku_galaxy/features/notifications/domain/repositories/notification_repository.dart';
import 'package:otaku_galaxy/features/points/domain/repositories/points_repository.dart';
import 'package:otaku_galaxy/features/points/presentation/cubit/points_cubit.dart';
import 'package:otaku_galaxy/features/reviews/domain/repositories/review_repository.dart';
import 'package:otaku_galaxy/features/reviews/presentation/cubit/reviews_cubit.dart';
import 'package:otaku_galaxy/features/favorites/presentation/cubit/favorites_cubit.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order.dart';
import 'package:otaku_galaxy/features/orders/domain/repositories/order_repository.dart';
import 'package:otaku_galaxy/features/settings/data/store_settings_repository.dart';
import 'package:otaku_galaxy/features/birthday/data/birthday_storage.dart';
import 'package:otaku_galaxy/features/products/domain/entities/category.dart';
import 'package:otaku_galaxy/features/products/domain/entities/home_data.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_categories_usecase.dart';
import 'package:otaku_galaxy/features/products/domain/usecases/fetch_home_usecase.dart';

import 'package:otaku_galaxy/features/auth/data/datasources/auth_local_storage.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/change_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/forgot_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/get_me_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/login_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/register_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/update_profile_usecase.dart';

import 'support/auth_stub.dart';

const _home = 0;
const _cart = 3;
const _account = 4;

class _NoPendingOrders implements OrderRepository {
  @override
  Future<Order?> fetchPendingConfirmation() async => null;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _EmptyCart implements CartRepository {
  @override
  Future<List<CartItem>> fetchCart() async => const [];
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _NoSettings implements StoreSettingsRepository {
  @override
  StoreSocialLinks get links => const StoreSocialLinks();
  @override
  Future<StoreSocialLinks> refresh() => Completer<StoreSocialLinks>().future;
  @override
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

class _NoBirthday implements BirthdayStorage {
  @override
  final ValueNotifier<int> revision = ValueNotifier<int>(0);
  @override
  bool get hasBirthday => false;
  @override
  bool get isBirthdayToday => false;
  @override
  bool get isRewardAvailable => false;
  @override
  bool get isUnlocked => false;
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      Completer<Object?>().future;
}

/// نسخةُ زائرٍ من `stubAuthCubit`: نفس الاعتماديات وتخزينٌ بلا جلسة.
AuthCubit guestAuthCubit() {
  final user = stubUser();
  final repo = StubAuthRepository(user);
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

/// تخزينُ جلسةٍ فارغة — زائر.
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

/// أبناء `IndexedStack` تُبنى جميعاً، فتطلب اعتمادياتها عند البناء.
///
/// [CRITICAL] المقيس هنا هو **التبويب المرئي** لا محتوى الشاشات. بديلٌ
/// لا يكتمل وعدُه يُبقي كل شاشة في حالة التحميل: لا شبكة، ولا استثناءات
/// من الأبناء تُلوّث ما نقيسه، والشاشة الحقيقية مبنيّة كما في التطبيق.
class _PendingHome implements FetchHomeUsecase {
  @override
  Future<HomeData> call() => Completer<HomeData>().future;
  @override
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

class _PendingCategories implements FetchCategoriesUsecase {
  @override
  Future<List<Category>> call() => Completer<List<Category>>().future;
  @override
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

class _PendingReviews implements ReviewRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

class _PendingPoints implements PointsRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

class _PendingCollections implements CollectionRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

class _PendingNotifications implements NotificationRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

/// يبني الشاشة الحقيقية بمستخدمٍ **مسجَّل** وبكل ما تحتاجه من مزوّدات.
Future<AuthCubit> _pumpLoggedIn(WidgetTester tester, {bool loggedIn = true}) async {
  tester.view.physicalSize = const Size(400, 800);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  if (!GetIt.I.isRegistered<OrderRepository>()) {
    GetIt.I.registerSingleton<OrderRepository>(_NoPendingOrders());
  }
  if (!GetIt.I.isRegistered<BirthdayStorage>()) {
    GetIt.I.registerSingleton<BirthdayStorage>(_NoBirthday());
  }
  if (!GetIt.I.isRegistered<StoreSettingsRepository>()) {
    GetIt.I.registerSingleton<StoreSettingsRepository>(_NoSettings());
  }
  addTearDown(GetIt.I.reset);


  final auth = loggedIn ? stubAuthCubit() : guestAuthCubit();
  if (loggedIn) await auth.loadSession();
  expect(
    auth.isLoggedIn,
    loggedIn,
    reason: 'التهيئة نفسها فشلت: حالة الجلسة ليست المطلوبة',
  );

  mainNavIndex.value = _home;
  await tester.pumpWidget(
    MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>.value(value: auth),
        BlocProvider<CartCubit>(create: (_) => CartCubit(_EmptyCart())),
        BlocProvider<FavoritesCubit>(create: (_) => FavoritesCubit()),
        BlocProvider<ReviewsCubit>(create: (_) => ReviewsCubit(_PendingReviews())),
        BlocProvider<PointsCubit>(create: (_) => PointsCubit(_PendingPoints())),
        BlocProvider<CollectionsCubit>(
          create: (_) => CollectionsCubit(_PendingCollections()),
        ),
        BlocProvider<NotificationsCubit>(
          create: (_) => NotificationsCubit(_PendingNotifications()),
        ),
      ],
      child: MultiRepositoryProvider(
        providers: [
          RepositoryProvider<FetchHomeUsecase>.value(value: _PendingHome()),
          RepositoryProvider<FetchCategoriesUsecase>.value(value: _PendingCategories()),
          RepositoryProvider<ReviewRepository>.value(value: _PendingReviews()),
        ],
        child: MaterialApp(
        theme: AppTheme.light,
        locale: const Locale('ar'),
        localizationsDelegates: const [
          DefaultMaterialLocalizations.delegate,
          DefaultWidgetsLocalizations.delegate,
        ],
          home: const Directionality(
            textDirection: TextDirection.rtl,
            child: MainNavigationScreen(),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  return auth;
}

/// الوجهة المرئية فعلاً — لا الفهرس المطلوب ولا ما نودّه.
int _visibleTab(WidgetTester tester) {
  final stack = tester.widget<IndexedStack>(find.byType(IndexedStack));
  final index = stack.index;
  expect(index, isNotNull, reason: 'IndexedStack بلا فهرس — لا شيء معروض');
  return index!;
}

Future<void> _tapTab(WidgetTester tester, int slot) async {
  final bar = tester.getRect(find.byType(OtakuBottomNav));
  // RTL: التبويب ٠ في أقصى اليمين الفيزيائي.
  final dx = bar.right - (bar.width * (slot + 0.5) / 5);
  await tester.tapAt(Offset(dx, bar.top + bar.height * 0.45));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 350));
}

void main() {
  group('[CRITICAL] المستخدم المسجَّل يصل إلى التبويبات المحمية', () {
    testWidgets('السلة: الضغط يُظهر تبويب السلة فعلاً', (tester) async {
      final auth = await _pumpLoggedIn(tester);
      expect(_visibleTab(tester), _home);

      await _tapTab(tester, _cart);

      expect(auth.isLoggedIn, isTrue);
      expect(
        _visibleTab(tester),
        _cart,
        reason: 'الضغط على السلة لم يغيّر التبويب المرئي — '
            'المستخدم مسجَّل ولا بوابة تعترضه',
      );
    });

    testWidgets('الحساب: الضغط يُظهر تبويب الحساب فعلاً', (tester) async {
      final auth = await _pumpLoggedIn(tester);

      await _tapTab(tester, _account);

      expect(auth.isLoggedIn, isTrue);
      expect(_visibleTab(tester), _account, reason: 'الحساب لم يُعرض');
    });

    testWidgets('السلة ← الحساب ← السلة', (tester) async {
      await _pumpLoggedIn(tester);
      await _tapTab(tester, _cart);
      expect(_visibleTab(tester), _cart);
      await _tapTab(tester, _account);
      expect(_visibleTab(tester), _account);
      await _tapTab(tester, _cart);
      expect(_visibleTab(tester), _cart);
    });

    testWidgets('ضغطٌ متكرّر على التبويب نفسه لا يُخرج منه', (tester) async {
      await _pumpLoggedIn(tester);
      for (var i = 0; i < 4; i++) {
        await _tapTab(tester, _cart);
        expect(_visibleTab(tester), _cart, reason: 'الضغطة ${i + 1} أخرجت من السلة');
      }
    });

    testWidgets('تناوبٌ سريع بين السلة والحساب ينتهي بالمطلوب', (tester) async {
      await _pumpLoggedIn(tester);
      final bar = tester.getRect(find.byType(OtakuBottomNav));
      double x(int slot) => bar.right - (bar.width * (slot + 0.5) / 5);
      final y = bar.top + bar.height * 0.45;

      for (final slot in [_cart, _account, _cart, _account]) {
        await tester.tapAt(Offset(x(slot), y));
        await tester.pump();
      }
      await tester.pump(const Duration(milliseconds: 400));
      expect(_visibleTab(tester), _account);
    });

    testWidgets('العودة إلى الرئيسية بعد تبويب محميّ', (tester) async {
      await _pumpLoggedIn(tester);
      await _tapTab(tester, _cart);
      expect(_visibleTab(tester), _cart);
      await _tapTab(tester, _home);
      expect(_visibleTab(tester), _home);
    });

    testWidgets('غير المحميّة تعمل للجميع: المجتمع', (tester) async {
      // ضابطٌ يفصل السبب: التبويبات غير المحميّة لا تمرّ بالبوابة أصلاً،
      // فبقاؤها سليمة أثناء العطب هو ما جعل «السلة والحساب وحدهما»
      // عَرَضاً مميِّزاً للعلّة.
      await _pumpLoggedIn(tester);
      await _tapTab(tester, 2);
      expect(_visibleTab(tester), 2);
    });

    testWidgets('جلسة محفوظة: بناءٌ جديد يبدأ من الرئيسية ثم ينتقل', (
      tester,
    ) async {
      // يحاكي إقلاعاً بارداً بجلسةٍ باقية: الشاشة تُبنى من جديد والمستخدم
      // ما يزال مسجَّلاً، فالتبويب المحميّ يجب أن يعمل من أول ضغطة.
      await _pumpLoggedIn(tester);
      expect(_visibleTab(tester), _home);
      await _tapTab(tester, _account);
      expect(_visibleTab(tester), _account);
    });
  });

  group('[CROWBAR] الزائر: البوابة تظهر ولا يُفتح التبويب المحميّ', () {
    testWidgets('السلة: يبقى في مكانه وتظهر بوابة الدخول', (tester) async {
      // [CRITICAL] العطب نفسه كان يكسر مسار الزائر أيضاً: الرمي يقع عند
      // تقييم وسيط `title` **قبل** `showLoginGate`، فلا بوابة ولا تبويب —
      // ضغطةٌ صامتة. هذا يحرس أن البوابة عادت تظهر، وأن التبويب المحميّ
      // لا يُفتح بلا جلسة.
      final auth = await _pumpLoggedIn(tester, loggedIn: false);
      expect(auth.isLoggedIn, isFalse);

      await _tapTab(tester, _cart);

      expect(_visibleTab(tester), _home, reason: 'زائرٌ دخل السلة بلا جلسة');
      expect(
        find.byType(BottomSheet),
        findsOneWidget,
        reason: 'بوابة تسجيل الدخول لم تظهر للزائر',
      );
    });

    testWidgets('الحساب: يبقى في مكانه وتظهر البوابة', (tester) async {
      await _pumpLoggedIn(tester, loggedIn: false);
      await _tapTab(tester, _account);
      expect(_visibleTab(tester), _home);
      expect(find.byType(BottomSheet), findsOneWidget);
    });

    testWidgets('الزائر يتنقّل بحرّية في التبويبات غير المحميّة', (tester) async {
      await _pumpLoggedIn(tester, loggedIn: false);
      await _tapTab(tester, 1);
      expect(_visibleTab(tester), 1);
      await _tapTab(tester, 2);
      expect(_visibleTab(tester), 2);
    });
  });
}
