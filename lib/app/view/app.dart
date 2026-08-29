import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import '../../core/config/app_config.dart';
import '../../core/design_system/design_system.dart';
import '../../core/di/injection_container.dart' as di;
import '../../core/router/app_router.dart';
import '../../features/auth/presentation/cubit/auth_cubit.dart';
import '../../features/auth/presentation/cubit/auth_state.dart';
import '../../features/cart/presentation/cubit/cart_cubit.dart';
import '../../features/collections/presentation/cubit/collections_cubit.dart';
import '../../features/connectivity/presentation/offline_gate.dart';
import '../../features/notifications/presentation/cubit/notifications_cubit.dart';
import '../../features/points/presentation/cubit/points_cubit.dart';
import '../../features/reviews/domain/repositories/review_repository.dart';
import '../../features/reviews/presentation/cubit/reviews_cubit.dart';
import '../../features/favorites/presentation/cubit/favorites_cubit.dart';
import '../../features/settings/presentation/cubit/locale_cubit.dart';
import '../../features/settings/presentation/cubit/theme_cubit.dart';
import '../../features/settings/presentation/cubit/theme_state.dart';
import '../../features/orders/domain/usecases/fetch_order_details_usecase.dart';
import '../../features/orders/domain/usecases/fetch_my_orders_usecase.dart';
import '../../features/orders/domain/usecases/place_order_usecase.dart';
import '../../features/products/domain/usecases/fetch_categories_usecase.dart';
import '../../features/products/domain/usecases/fetch_category_products_usecase.dart';
import '../../features/products/domain/usecases/fetch_governorates_usecase.dart';
import '../../features/products/domain/usecases/fetch_home_usecase.dart';
import '../../features/products/domain/usecases/fetch_product_details_usecase.dart';
import '../../features/products/domain/usecases/fetch_products_usecase.dart';
import '../../features/products/domain/usecases/search_products_usecase.dart';
import '../../features/birthday/data/birthday_storage.dart';

/// جذر التطبيق: يربط الثيم والرواتر والاعتماديات المشتركة.
class OtakuGalaxyApp extends StatelessWidget {
  const OtakuGalaxyApp({super.key, required this.config});

  final AppConfig config;

  @override
  Widget build(BuildContext context) {
    final appRouter = di.sl<AppRouter>();
    return MultiRepositoryProvider(
      providers: [
        RepositoryProvider.value(value: di.sl<FetchHomeUsecase>()),
        RepositoryProvider.value(value: di.sl<FetchCategoriesUsecase>()),
        RepositoryProvider.value(value: di.sl<FetchCategoryProductsUsecase>()),
        RepositoryProvider.value(value: di.sl<SearchProductsUsecase>()),
        RepositoryProvider.value(value: di.sl<FetchProductDetailsUsecase>()),
        RepositoryProvider.value(value: di.sl<FetchProductsUsecase>()),
        RepositoryProvider.value(value: di.sl<PlaceOrderUsecase>()),
        RepositoryProvider.value(value: di.sl<FetchMyOrdersUsecase>()),
        RepositoryProvider.value(value: di.sl<FetchOrderDetailsUsecase>()),
        RepositoryProvider.value(value: di.sl<FetchGovernoratesUsecase>()),
        // شاشة المجتمع تقرأ مستودع التقييمات مباشرة.
        RepositoryProvider.value(value: di.sl<ReviewRepository>()),
      ],
      child: MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: di.sl<AuthCubit>()),
          BlocProvider<CartCubit>.value(value: di.sl<CartCubit>()),
          BlocProvider<FavoritesCubit>.value(value: di.sl<FavoritesCubit>()),
          BlocProvider<ThemeCubit>.value(value: di.sl<ThemeCubit>()),
          BlocProvider<LocaleCubit>.value(value: di.sl<LocaleCubit>()),
          BlocProvider<ReviewsCubit>.value(value: di.sl<ReviewsCubit>()),
          BlocProvider<PointsCubit>.value(value: di.sl<PointsCubit>()),
          BlocProvider<NotificationsCubit>.value(
            value: di.sl<NotificationsCubit>(),
          ),
          BlocProvider<CollectionsCubit>.value(
            value: di.sl<CollectionsCubit>(),
          ),
        ],
        child: BlocListener<AuthCubit, AuthState>(
          // [NOTE]: دورة حياة الجلسة موحّدة هنا: السلة والمفضلة خاصيتا
          // حساب فقط — عند الدخول تُحمَّلان من الخادم، وعند الخروج تُمسحان
          // محلياً (لا سلة زائر). التصفح كزائر مسموح للتصفح فقط؛ الشاشات
          // التي تحتاج حساباً تعرض دعوة تسجيل الدخول عند الحاجة.
          listener: (context, state) {
            if (state is AuthAuthenticated) {
              di.sl<CartCubit>().load();
              di.sl<FavoritesCubit>().load();
              // حالة عيد الميلاد تُقرأ من الخادم لكل حساب على حدة.
              di.sl<BirthdayStorage>().refresh();
              di.sl<NotificationsCubit>().load();
              di.sl<PointsCubit>().load();
            } else if (state is AuthUnauthenticated) {
              // كل ما يخص الحساب يُمسح فوراً حتى لا يظهر لحساب آخر.
              di.sl<CartCubit>().clear();
              di.sl<FavoritesCubit>().clear();
              di.sl<BirthdayStorage>().clear();
              di.sl<PointsCubit>().clear();
              di.sl<NotificationsCubit>().clear();
              di.sl<CollectionsCubit>().clear();
              di.sl<ReviewsCubit>().clear();
            }
          },
          child: BlocBuilder<LocaleCubit, AppLanguage>(
            builder: (context, language) =>
                BlocBuilder<ThemeCubit, ThemeState>(
            builder: (context, themeState) {
              return MaterialApp.router(
                title: config.appName,
                debugShowCheckedModeBanner: false,
                theme: AppTheme.light,
                darkTheme: AppTheme.dark,
                themeMode:
                    themeState.isDark ? ThemeMode.dark : ThemeMode.light,
                // [NOTE]: تبديل فوري بدون وميض رمادي بين المظهرين.
                themeAnimationDuration: Duration.zero,
                themeAnimationCurve: Curves.linear,
                // العربية والكردية كلتاهما RTL — الاتجاه ثابت بينهما.
                locale: language.locale,
                supportedLocales: AppLanguage.values.map((l) => l.locale),
                localizationsDelegates: const [
                  GlobalMaterialLocalizations.delegate,
                  GlobalWidgetsLocalizations.delegate,
                  GlobalCupertinoLocalizations.delegate,
                ],
                // الكردية (ckb) بلا حزمة ترجمة في Flutter — نُبقي تعريبات
                // Material العربية كأقرب بديل بدل الرجوع للإنجليزية.
                localeResolutionCallback: (locale, supported) =>
                    const Locale('ar'),
                // حاجز الاتصال يغلّف كل الشاشات — زائر أو مسجّل أو عائد،
                // بلا استثناء؛ لا محتوى فارغ أوفلاين.
                builder: (context, child) =>
                    OfflineGate(child: child ?? const SizedBox.shrink()),
                routerConfig: appRouter.config(),
              );
            },
                ),
          ),
        ),
      ),
    );
  }
}
