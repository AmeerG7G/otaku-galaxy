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
import '../../features/favorites/presentation/cubit/favorites_cubit.dart';
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
      ],
      child: MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: di.sl<AuthCubit>()),
          BlocProvider<CartCubit>.value(value: di.sl<CartCubit>()),
          BlocProvider<FavoritesCubit>.value(value: di.sl<FavoritesCubit>()),
          BlocProvider<ThemeCubit>.value(value: di.sl<ThemeCubit>()),
        ],
        child: BlocListener<AuthCubit, AuthState>(
          // [NOTE]: دورة حياة الجلسة موحّدة هنا:
          // عند الدخول تُحمّل السلة والمفضلة، وعند الخروج تُمسح
          // وتُعاد التوجيه لشاشة الدخول (يشمل انتهاء التوكن 401).
          listener: (context, state) {
            if (state is AuthAuthenticated) {
              di.sl<CartCubit>().load();
              di.sl<FavoritesCubit>().load();
            } else if (state is AuthUnauthenticated) {
              di.sl<CartCubit>().clear();
              di.sl<FavoritesCubit>().clear();
              final current = appRouter.current.name;
              if (current != LoginRoute.name && current != SplashRoute.name) {
                appRouter.replaceAll([LoginRoute()]);
              }
            }
          },
          child: BlocBuilder<ThemeCubit, ThemeState>(
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
                locale: const Locale('ar'),
                supportedLocales: const [Locale('ar')],
                localizationsDelegates: const [
                  GlobalMaterialLocalizations.delegate,
                  GlobalWidgetsLocalizations.delegate,
                  GlobalCupertinoLocalizations.delegate,
                ],
                routerConfig: appRouter.config(),
              );
            },
          ),
        ),
      ),
    );
  }
}
