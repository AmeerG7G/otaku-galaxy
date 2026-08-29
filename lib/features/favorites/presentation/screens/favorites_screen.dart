import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';
import '../../../auth/presentation/cubit/auth_state.dart';
import '../../../collections/presentation/screens/collections_tab.dart';
import '../../../home/presentation/widgets/product_card.dart';
import '../../../main_navigation/presentation/screens/main_navigation_screen.dart';
import '../cubit/favorites_cubit.dart';
import '../cubit/favorites_state.dart';

/// تبويب المفضلة بتصميم Otaku Galaxy v2.
///
/// ترويسة تبويب كبيرة، ثم مبدّل مقسّم (المفضلة / مجموعاتي) بدل `TabBar`
/// المادي، ثم شبكة بطاقات منتجات بعمودين — لا صفوف بطاقات مادية.
/// المجموعات تعيش داخل المفضلة ولا تظهر كوجهة تنقل رئيسية.
@RoutePage()
class FavoritesScreen extends StatefulWidget {
  const FavoritesScreen({super.key});

  @override
  State<FavoritesScreen> createState() => _FavoritesScreenState();
}

class _FavoritesScreenState extends State<FavoritesScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final isLoggedIn = context.select<AuthCubit, bool>(
      (cubit) => cubit.state is AuthAuthenticated,
    );

    return Scaffold(
      body: SafeArea(
        child: BlocBuilder<FavoritesCubit, FavoritesState>(
          builder: (context, state) {
            return Column(
              children: [
                OtakuScreenHeader(
                  title: 'المفضلة',
                  onBack: () => context.router.maybePop(),
                  subtitle: !isLoggedIn
                      ? 'سجّل الدخول لتحفظ ما يعجبك'
                      : state.products.isEmpty
                      ? 'لسه ما حفظت أي منتج'
                      : '${state.products.length} منتج محفوظ',
                ),
                if (!isLoggedIn)
                  Expanded(
                    child: AnimeGuestPrompt(
                      title: 'أنت تتصفح كزائر',
                      body: 'سجّل الدخول لتتابع طلباتك وتحفظ مفضلتك ومجموعاتك.',
                      icon: Icons.favorite_outline,
                      onLogin: () => context.router.push(const LoginRoute()),
                    ),
                  )
                else ...[
                  OtakuSegmentedControl(
                    labels: const ['المفضلة', 'مجموعاتي'],
                    selectedIndex: _tab,
                    onSelected: (index) => setState(() => _tab = index),
                  ),
                  Expanded(
                    child: _tab == 0
                        ? _buildFavorites(state)
                        : const CollectionsTab(),
                  ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildFavorites(FavoritesState state) {
    if (state.products.isEmpty) {
      return AnimeEmptyState(
        title: 'مفضلتك لسه فاضية',
        subtitle: 'اضغط القلب على أي منتج يعجبك، وراح يستناك هنا.',
        artwork: 'assets/art/opt/a-i2.png',
        actionLabel: 'اكتشف منتجات',
        onAction: () {
          context.router.maybePop();
          mainNavIndex.value = MainTab.home;
        },
      );
    }

    return RefreshIndicator(
      onRefresh: () => context.read<FavoritesCubit>().load(),
      child: GridView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(18, 12, 18, 26),
        gridDelegate: kProductGridDelegate,
        itemCount: state.products.length,
        itemBuilder: (context, index) =>
            ProductCard(product: state.products[index], compact: true),
      ),
    );
  }
}
