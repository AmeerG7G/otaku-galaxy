import 'dart:developer';

import 'package:flutter/foundation.dart';
import 'package:get_it/get_it.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config/app_config.dart';
import '../network/api_client.dart';
import '../router/app_router.dart';
import '../../features/auth/data/datasources/auth_local_storage.dart';
import '../../features/auth/data/repositories/auth_repository_impl.dart';
import '../../features/auth/domain/repositories/auth_repository.dart';
import '../../features/auth/domain/usecases/get_me_usecase.dart';
import '../../features/auth/domain/usecases/login_usecase.dart';
import '../../features/auth/domain/usecases/forgot_password_usecase.dart';
import '../../features/auth/domain/usecases/register_usecase.dart';
import '../../features/auth/domain/usecases/reset_password_usecase.dart';
import '../../features/auth/domain/usecases/send_otp_usecase.dart';
import '../../features/auth/domain/usecases/update_profile_usecase.dart';
import '../../features/auth/domain/usecases/verify_otp_usecase.dart';
import '../../features/auth/presentation/cubit/auth_cubit.dart';
import '../../features/cart/data/repositories/cart_repository_impl.dart';
import '../../features/cart/domain/repositories/cart_repository.dart';
import '../../features/cart/presentation/cubit/cart_cubit.dart';
import '../../features/favorites/data/repositories/favorites_repository_impl.dart';
import '../../features/favorites/domain/repositories/favorites_repository.dart';
import '../../features/favorites/presentation/cubit/favorites_cubit.dart';
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
import '../../features/settings/presentation/cubit/theme_cubit.dart';

/// حاوية الحقن الموحد [GetIt] للتطبيق.
final GetIt sl = GetIt.instance;

/// تهيئة جميع الاعتماديات في التطبيق.
Future<void> init({AppConfig? config}) async {
  try {
    // تسجيل الإعدادات أولاً.
    final appConfig = config ?? AppConfig.development;
    sl.registerLazySingleton<AppConfig>(() => appConfig);

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
    ..registerLazySingleton<AppRouter>(AppRouter.new);
}

/// تهيئة الاعتماديات الأساسية (المستودعات وحالات الاستخدام).
void _initCore() {
  final apiClient = ApiClient(config: sl<AppConfig>());
  sl
    ..registerLazySingleton<ApiClient>(() => apiClient)
    ..registerLazySingleton<AuthRepository>(AuthRepositoryImpl.new)
    ..registerLazySingleton<ProductRepository>(ProductRepositoryImpl.new)
    ..registerLazySingleton<GovernorateRepository>(
      GovernorateRepositoryImpl.new,
    )
    ..registerLazySingleton<OrderRepository>(OrderRepositoryImpl.new)
    ..registerLazySingleton<CartRepository>(CartRepositoryImpl.new)
    ..registerLazySingleton<FavoritesRepository>(FavoritesRepositoryImpl.new);
}

/// تهيئة الاعتماديات الخاصة بكل ميزة.
void _initFeatures() {
  _initAuthFeature();
  _initProductsFeature();
  _initOrdersFeature();
  _initCartFeature();
  _initFavoritesFeature();
  _initSettingsFeature();
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
  // [NOTE]: Singleton — السلة تُعرض في أكثر من شاشة وشارة العدد.
  sl.registerLazySingleton<CartCubit>(
    () => CartCubit(repository: sl<CartRepository>()),
  );
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
  // [NOTE]: Singleton — المظهر مشترك بين شاشة الإعدادات وجذر التطبيق.
  sl.registerLazySingleton<ThemeCubit>(
    () => ThemeCubit(sl<SharedPreferences>()),
  );
}

/// إعادة تعيين جميع الاعتماديات (مفيدة في الاختبارات).
Future<void> reset() async => sl.reset();
