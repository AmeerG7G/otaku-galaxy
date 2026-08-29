import 'dart:developer';

import 'package:flutter/foundation.dart';
import 'package:get_it/get_it.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config/app_config.dart';
import '../network/api_client.dart';
import '../network/media_url.dart';
import '../router/app_router.dart';
import '../../features/auth/data/datasources/auth_local_storage.dart';
import '../../features/auth/data/repositories/auth_repository_impl.dart';
import '../../features/auth/domain/repositories/auth_repository.dart';
import '../../features/auth/domain/usecases/change_password_usecase.dart';
import '../../features/auth/domain/usecases/get_me_usecase.dart';
import '../../features/auth/domain/usecases/login_usecase.dart';
import '../../features/auth/domain/usecases/forgot_password_usecase.dart';
import '../../features/auth/domain/usecases/register_usecase.dart';
import '../../features/auth/domain/usecases/reset_password_usecase.dart';
import '../../features/auth/domain/usecases/send_otp_usecase.dart';
import '../../features/auth/domain/usecases/update_profile_usecase.dart';
import '../../features/auth/domain/usecases/verify_otp_usecase.dart';
import '../../features/auth/presentation/cubit/auth_cubit.dart';
import '../../features/birthday/data/birthday_storage.dart';
import '../../features/cart/data/repositories/cart_repository_impl.dart';
import '../../features/collections/data/repositories/api_collection_repository.dart';
import '../../features/collections/domain/repositories/collection_repository.dart';
import '../../features/collections/presentation/cubit/collections_cubit.dart';
import '../../features/notifications/data/repositories/api_notification_repository.dart';
import '../../features/notifications/domain/repositories/notification_repository.dart';
import '../../features/notifications/presentation/cubit/notifications_cubit.dart';
import '../../features/points/data/repositories/api_points_repository.dart';
import '../../features/points/domain/repositories/points_repository.dart';
import '../../features/points/presentation/cubit/points_cubit.dart';
import '../../features/reviews/data/repositories/api_review_repository.dart';
import '../../features/reviews/domain/repositories/review_repository.dart';
import '../../features/reviews/presentation/cubit/reviews_cubit.dart';
import '../../features/cart/domain/repositories/cart_repository.dart';
import '../../features/cart/presentation/cubit/cart_cubit.dart';
import '../../features/favorites/data/repositories/favorites_repository_impl.dart';
import '../../features/favorites/domain/repositories/favorites_repository.dart';
import '../../features/favorites/presentation/cubit/favorites_cubit.dart';
import '../../features/onboarding/data/onboarding_storage.dart';
import '../../features/orders/data/repositories/order_repository_impl.dart';
import '../../features/orders/domain/repositories/order_repository.dart';
import '../../features/orders/domain/usecases/fetch_my_orders_usecase.dart';
import '../../features/orders/domain/usecases/fetch_order_details_usecase.dart';
import '../../features/orders/domain/usecases/place_order_usecase.dart';
import '../../features/products/data/repositories/governorate_repository_impl.dart';
import '../../features/products/data/repositories/product_repository_impl.dart';
import '../../features/products/domain/repositories/governorate_repository.dart';
import '../../features/products/domain/repositories/product_repository.dart';
import '../../features/products/domain/usecases/fetch_categories_usecase.dart';
import '../../features/products/domain/usecases/fetch_category_products_usecase.dart';
import '../../features/products/domain/usecases/fetch_governorates_usecase.dart';
import '../../features/products/domain/usecases/fetch_home_usecase.dart';
import '../../features/products/domain/usecases/fetch_product_details_usecase.dart';
import '../../features/products/domain/usecases/fetch_products_usecase.dart';
import '../../features/products/domain/usecases/search_products_usecase.dart';
import '../../features/settings/presentation/cubit/locale_cubit.dart';
import '../../features/settings/presentation/cubit/theme_cubit.dart';
import '../../features/settings/data/store_settings_repository.dart';
import '../../features/settings/data/notification_prefs_storage.dart';
import '../../features/settings/data/personalize_storage.dart';
import '../../features/search/data/search_history_storage.dart';

/// حاوية الحقن الموحد [GetIt] للتطبيق.
final GetIt sl = GetIt.instance;

/// تهيئة جميع الاعتماديات في التطبيق.
Future<void> init({AppConfig? config}) async {
  try {
    // تسجيل الإعدادات أولاً.
    final appConfig = config ?? AppConfig.development;
    sl.registerLazySingleton<AppConfig>(() => appConfig);

    // أصل الوسائط يتبع نفس عنوان الـAPI للبيئة الحالية، فتُحلّ المراجع
    // النسبية (`/uploads/...`) إلى الأصل الذي يراه هذا الجهاز فعلاً.
    configureMediaOrigin(appConfig);

    // تهيئة الاعتماديات الخارجية (غير المتزامنة).
    await _initExternalDependencies();

    // تهيئة الاعتماديات الأساسية.
    _initCore();

    // تهيئة الاعتماديات الخاصة بكل ميزة.
    _initFeatures();

    // ربط الجلسة بعميل الـ API بعد اكتمال البناء (يُستدعى عند كل طلب).
    sl<ApiClient>().attachAuth(
      tokenProvider: () => sl<AuthLocalStorage>().token,
      onUnauthorized: () => sl<AuthCubit>().forceLogout(),
    );

    sl<ThemeCubit>().loadPreference();
    sl<LocaleCubit>().loadPreference();

    if (kDebugMode) {
      // [DEBUG]: سجل نجاح التهيئة أثناء التطوير فقط.
      log('Dependency injection initialized successfully for $appConfig');
    }
  } catch (e, stackTrace) {
    if (kDebugMode) {
      // [DEBUG]: سجل فشل التهيئة أثناء التطوير فقط.
      log(
        'Failed to initialize dependency injection: $e',
        stackTrace: stackTrace,
      );
    }
    rethrow;
  }
}

/// تهيئة الاعتماديات الخارجية (عمليات غير متزامنة).
Future<void> _initExternalDependencies() async {
  final sharedPreferences = await SharedPreferences.getInstance();
  final authStorage = AuthLocalStorage();
  await authStorage.load();
  sl
    ..registerLazySingleton<SharedPreferences>(() => sharedPreferences)
    ..registerLazySingleton<AuthLocalStorage>(() => authStorage)
    ..registerLazySingleton<OnboardingStorage>(
      () => OnboardingStorage(sharedPreferences),
    )
    ..registerLazySingleton<AppRouter>(AppRouter.new);
}

/// تهيئة الاعتماديات الأساسية (المستودعات وحالات الاستخدام).
void _initCore() {
  final apiClient = ApiClient(config: sl<AppConfig>());
  // [CRITICAL]: كل مستودع يجب أن يستقبل عميل الـ API المشترك.
  // البناء الافتراضي (`.new` بلا وسائط) كان يُنشئ عميلاً جديداً بلا
  // `tokenProvider`، فتخرج كل الطلبات المحمية بلا ترويسة Authorization
  // ويردّ الخادم 401 «مطلوب تسجيل الدخول» رغم وجود جلسة صالحة.
  sl
    ..registerLazySingleton<ApiClient>(() => apiClient)
    ..registerLazySingleton<AuthRepository>(
      () => AuthRepositoryImpl(api: sl<ApiClient>()),
    )
    ..registerLazySingleton<ProductRepository>(
      () => ProductRepositoryImpl(api: sl<ApiClient>()),
    )
    ..registerLazySingleton<GovernorateRepository>(
      () => GovernorateRepositoryImpl(api: sl<ApiClient>()),
    )
    ..registerLazySingleton<OrderRepository>(
      () => OrderRepositoryImpl(api: sl<ApiClient>()),
    )
    ..registerLazySingleton<CartRepository>(
      () => CartRepositoryImpl(api: sl<ApiClient>()),
    )
    ..registerLazySingleton<FavoritesRepository>(
      () => FavoritesRepositoryImpl(api: sl<ApiClient>()),
    );
}

/// تهيئة الاعتماديات الخاصة بكل ميزة.
void _initFeatures() {
  _initAuthFeature();
  _initProductsFeature();
  _initOrdersFeature();
  _initCartFeature();
  _initFavoritesFeature();
  _initSettingsFeature();
  _initEngagementFeatures();
}

/// ميزات التفاعل: التقييمات، نقاط المجرّة، الإشعارات، المجموعات، وعيد
/// الميلاد. جميعها الآن مدعومة بالخادم الحقيقي عبر نفس واجهات المستودعات
/// التي كانت تستخدمها التنفيذات المحلية — فلم تتغير أي شاشة أو Cubit.
void _initEngagementFeatures() {
  // [CRITICAL]: نفس قاعدة `_initCore` — عميل الـ API المشترك لا الافتراضي.
  sl
    ..registerLazySingleton<ReviewRepository>(
      () => ApiReviewRepository(api: sl<ApiClient>()),
    )
    ..registerLazySingleton<PointsRepository>(
      () => ApiPointsRepository(api: sl<ApiClient>()),
    )
    ..registerLazySingleton<NotificationRepository>(
      () => ApiNotificationRepository(api: sl<ApiClient>()),
    )
    ..registerLazySingleton<CollectionRepository>(
      () => ApiCollectionRepository(api: sl<ApiClient>()),
    )
    ..registerLazySingleton<BirthdayStorage>(
      () => BirthdayStorage(api: sl<ApiClient>()),
    )
    ..registerLazySingleton<StoreSettingsRepository>(
      () => StoreSettingsRepository(api: sl<ApiClient>()),
    )
    ..registerLazySingleton<PersonalizeStorage>(
      () => PersonalizeStorage(sl<SharedPreferences>()),
    )
    ..registerLazySingleton<NotificationPrefsStorage>(
      () => NotificationPrefsStorage(sl<SharedPreferences>()),
    )
    ..registerLazySingleton<SearchHistoryStorage>(
      () => SearchHistoryStorage(sl<SharedPreferences>()),
    )
    // [NOTE]: singletons — هذه الحالات مشتركة بين أكثر من شاشة.
    // منح النقاط مسؤولية الخادم — لم يعد الـCubit يمنحها.
    ..registerLazySingleton<ReviewsCubit>(
      () => ReviewsCubit(sl<ReviewRepository>()),
    )
    ..registerLazySingleton<PointsCubit>(
      () => PointsCubit(sl<PointsRepository>()),
    )
    ..registerLazySingleton<NotificationsCubit>(
      () => NotificationsCubit(sl<NotificationRepository>()),
    )
    ..registerLazySingleton<CollectionsCubit>(
      () => CollectionsCubit(sl<CollectionRepository>()),
    );
}

/// تهيئة ميزة المصادقة.
void _initAuthFeature() {
  sl
    // حالات الاستخدام.
    ..registerLazySingleton<LoginUsecase>(
      () => LoginUsecase(sl<AuthRepository>()),
    )
    ..registerLazySingleton<RegisterUsecase>(
      () => RegisterUsecase(sl<AuthRepository>()),
    )
    ..registerLazySingleton<SendOtpUsecase>(
      () => SendOtpUsecase(sl<AuthRepository>()),
    )
    ..registerLazySingleton<ForgotPasswordUsecase>(
      () => ForgotPasswordUsecase(sl<AuthRepository>()),
    )
    ..registerLazySingleton<VerifyOtpUsecase>(
      () => VerifyOtpUsecase(sl<AuthRepository>()),
    )
    ..registerLazySingleton<ResetPasswordUsecase>(
      () => ResetPasswordUsecase(sl<AuthRepository>()),
    )
    ..registerLazySingleton<GetMeUsecase>(
      () => GetMeUsecase(sl<AuthRepository>()),
    )
    ..registerLazySingleton<UpdateProfileUsecase>(
      () => UpdateProfileUsecase(sl<AuthRepository>()),
    )
    ..registerLazySingleton<ChangePasswordUsecase>(
      () => ChangePasswordUsecase(sl<AuthRepository>()),
    )
    // [NOTE]: AuthCubit مسجّل كـ singleton لأن حالة الجلسة مشتركة بين
    // عدة شاشات؛ تعديلها في شاشة ينعكس على باقي الشاشات تلقائياً.
    ..registerLazySingleton<AuthCubit>(
      () => AuthCubit(
        localStorage: sl<AuthLocalStorage>(),
        loginUsecase: sl<LoginUsecase>(),
        registerUsecase: sl<RegisterUsecase>(),
        sendOtpUsecase: sl<SendOtpUsecase>(),
        forgotPasswordUsecase: sl<ForgotPasswordUsecase>(),
        verifyOtpUsecase: sl<VerifyOtpUsecase>(),
        resetPasswordUsecase: sl<ResetPasswordUsecase>(),
        getMeUsecase: sl<GetMeUsecase>(),
        updateProfileUsecase: sl<UpdateProfileUsecase>(),
        changePasswordUsecase: sl<ChangePasswordUsecase>(),
      ),
    );
}

/// تهيئة ميزة المنتجات.
void _initProductsFeature() {
  sl
    ..registerLazySingleton<FetchHomeUsecase>(
      () => FetchHomeUsecase(sl<ProductRepository>()),
    )
    ..registerLazySingleton<FetchProductsUsecase>(
      () => FetchProductsUsecase(sl<ProductRepository>()),
    )
    ..registerLazySingleton<FetchCategoriesUsecase>(
      () => FetchCategoriesUsecase(sl<ProductRepository>()),
    )
    ..registerLazySingleton<FetchCategoryProductsUsecase>(
      () => FetchCategoryProductsUsecase(sl<ProductRepository>()),
    )
    ..registerLazySingleton<SearchProductsUsecase>(
      () => SearchProductsUsecase(sl<ProductRepository>()),
    )
    ..registerLazySingleton<FetchProductDetailsUsecase>(
      () => FetchProductDetailsUsecase(sl<ProductRepository>()),
    )
    ..registerLazySingleton<FetchGovernoratesUsecase>(
      () => FetchGovernoratesUsecase(sl<GovernorateRepository>()),
    );
}

/// تهيئة ميزة الطلبات.
void _initOrdersFeature() {
  sl
    ..registerLazySingleton<PlaceOrderUsecase>(
      () => PlaceOrderUsecase(sl<OrderRepository>()),
    )
    ..registerLazySingleton<FetchMyOrdersUsecase>(
      () => FetchMyOrdersUsecase(sl<OrderRepository>()),
    )
    ..registerLazySingleton<FetchOrderDetailsUsecase>(
      () => FetchOrderDetailsUsecase(sl<OrderRepository>()),
    );
}

/// تهيئة ميزة السلة.
void _initCartFeature() {
  // [NOTE]: Singleton — السلة خاصية حساب فقط (بلا سلة زائر محلية)؛
  // تُعرض في أكثر من شاشة وشارة العدد.
  sl.registerLazySingleton<CartCubit>(() => CartCubit(sl<CartRepository>()));
}

/// تهيئة ميزة المفضلة.
void _initFavoritesFeature() {
  // [NOTE]: Singleton — المفضلة تظهر وتُعدّل في أكثر من شاشة.
  sl.registerLazySingleton<FavoritesCubit>(
    () => FavoritesCubit(repository: sl<FavoritesRepository>()),
  );
}

/// تهيئة ميزة الإعدادات.
void _initSettingsFeature() {
  // [NOTE]: Singletons — المظهر واللغة مشتركان بين الإعدادات وجذر التطبيق.
  sl
    ..registerLazySingleton<ThemeCubit>(
      () => ThemeCubit(sl<SharedPreferences>()),
    )
    ..registerLazySingleton<LocaleCubit>(
      () => LocaleCubit(sl<SharedPreferences>()),
    );
}

/// إعادة تعيين جميع الاعتماديات (مفيدة في الاختبارات).
Future<void> reset() async => sl.reset();
